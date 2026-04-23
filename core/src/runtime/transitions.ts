// Pure workflow engine — no I/O, no side effects.
// Takes BEP schema + instance state, returns new state + effects to fire.

import type { BEP, FlowEdge, EdgeGuard } from '../types/schema.js'
import type {
  IncomingEvent,
  TransitionEvent,
  WorkflowInstance,
  InstanceStatus,
  NodeConfig,
  RoleRef,
  TeamRef,
  RaciLevel,
  ProcessEventError,
  TransitionStep,
} from './types.js'

// Safety limit to prevent infinite loops in malformed decision chains.
const MAX_DECISION_DEPTH = 10

// ─── Guard evaluation ─────────────────────────────────────────────────────────

/** Evaluates a guard condition against an event payload. Pure. */
export function evaluateGuard(guard: EdgeGuard, payload: Record<string, unknown>): boolean {
  const val = payload[guard.field]
  switch (guard.operator) {
    case 'exists':   return val !== undefined && val !== null
    case 'eq':       return val === guard.value
    case 'neq':      return val !== guard.value
    case 'gt':       return typeof val === 'number' && typeof guard.value === 'number' && val > guard.value
    case 'lt':       return typeof val === 'number' && typeof guard.value === 'number' && val < guard.value
    case 'contains':
      if (typeof val === 'string' && typeof guard.value === 'string') return val.includes(guard.value)
      if (Array.isArray(val)) return (val as unknown[]).includes(guard.value)
      return false
    default:         return false
  }
}

// ─── Edge matching ────────────────────────────────────────────────────────────

function edgeMatchesEvent(edge: FlowEdge, event: IncomingEvent): boolean {
  if (!('triggerEventId' in edge)) return false
  if (edge.triggerEventId !== event.eventId) return false
  return true
}

// ─── Internal result type ─────────────────────────────────────────────────────

/** Internal result of processEvent — used by Engine to build EventResult. */
export interface ProcessEventResult {
  ok: boolean
  /** Updated instance. Present when ok = true. */
  instance?: WorkflowInstance
  /** Ordered list of transitions applied (may include decision auto-traversals). */
  transitionsApplied?: TransitionStep[]
  /** Effects to execute after the transition. Caller is responsible for firing them. */
  effectsToFire?: { effectId: string; fromEdgeId: string }[]
  /** Present when the final node is an automation node — Engine must execute the automation then emit the returned eventId. */
  automationNodePending?: { nodeId: string; automationId: string }
  error?: ProcessEventError
}

// ─── Create instance ──────────────────────────────────────────────────────────

/**
 * Creates a new WorkflowInstance and advances it past the start node.
 *
 * The start node is always a visual anchor — it has no RACI, no action, and no
 * trigger event on its outgoing edge. The instance is immediately moved to the
 * first node after start so that the first emit() acts on the real first step.
 *
 * Returns null if the workflow is not found or has no start node.
 */
export function createInstance(
  bep: BEP,
  workflowId: string,
  trackedAsset: WorkflowInstance['trackedAsset'],
  initiatedBy: string,
  bepVersion: string,
): { instance: WorkflowInstance; startEffects: { effectId: string; fromEdgeId: string }[] } | null {
  const workflow = bep.workflows.find(w => w.id === workflowId)
  if (!workflow) return null

  const startNodeId = Object.keys(workflow.diagram.nodes).find(
    k => workflow.diagram.nodes[k]!.type === 'start',
  )
  if (!startNodeId) return null

  // Advance past the start node — find its single outgoing edge (no trigger required).
  const startEdgeEntry = Object.entries(workflow.diagram.edges).find(([, e]) => e.from === startNodeId)
  const firstNodeId = startEdgeEntry?.[1].to ?? startNodeId
  const startEffects = startEdgeEntry
    ? (startEdgeEntry[1].effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: startEdgeEntry[0] }))
    : []

  const now = new Date().toISOString()
  return {
    instance: {
      id: globalThis.crypto.randomUUID(),
      workflowId,
      bepVersion,
      trackedAsset,
      currentNodeId: firstNodeId,
      status: 'active',
      context: {},
      history: [],
      createdAt: now,
      updatedAt: now,
      initiatedBy,
    },
    startEffects,
  }
}

// ─── Process event ────────────────────────────────────────────────────────────

/**
 * Processes an incoming event against a workflow instance.
 *
 * - Finds the matching outgoing edge from the current node.
 * - Merges the event payload into the instance context.
 * - Auto-traverses decision nodes using the same event payload.
 * - Returns the updated instance and the effects to fire. Pure — does not mutate.
 */
export function processEvent(
  bep: BEP,
  instance: WorkflowInstance,
  event: IncomingEvent,
): ProcessEventResult {
  if (instance.status !== 'active') {
    return { ok: false, error: 'INSTANCE_NOT_ACTIVE' }
  }

  const workflow = bep.workflows.find(w => w.id === instance.workflowId)
  if (!workflow) return { ok: false, error: 'NO_MATCHING_EDGE' }

  const { nodes, edges } = workflow.diagram

  // Working state — assembled immutably into the final instance at the end.
  let currentNodeId = instance.currentNodeId
  let context = { ...instance.context }
  const newHistory: TransitionEvent[] = []
  const effectsToFire: { effectId: string; fromEdgeId: string }[] = []
  const transitionsApplied: TransitionStep[] = []

  // ── Step 1: match an edge from the current node ───────────────────────────

  const candidates = Object.entries(edges).filter(
    ([, e]) => e.from === currentNodeId && edgeMatchesEvent(e, event),
  )

  if (candidates.length === 0) return { ok: false, error: 'NO_MATCHING_EDGE' }
  if (candidates.length > 1)   return { ok: false, error: 'AMBIGUOUS_TRANSITION' }

  const [edgeId, edge] = candidates[0]!

  context = { ...context, ...event.payload }
  newHistory.push(buildTransitionEvent(edgeId, currentNodeId, edge.to, event, context))
  effectsToFire.push(...(edge.effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: edgeId })))
  transitionsApplied.push({ edgeId, fromNodeId: currentNodeId, toNodeId: edge.to })
  currentNodeId = edge.to

  // ── Step 2: auto-traverse decision nodes ─────────────────────────────────
  //
  // Decision nodes are never stable resting points — the engine evaluates their
  // outgoing edges immediately using the original event's payload.
  // Guards on outgoing decision edges should be mutually exclusive.

  let depth = 0
  while (nodes[currentNodeId]?.type === 'decision') {
    if (++depth > MAX_DECISION_DEPTH) return { ok: false, error: 'DECISION_LOOP' }

    const outgoing = Object.entries(edges).filter(([, e]) => {
      if (e.from !== currentNodeId) return false
      if (!('guard' in e)) return false
      return evaluateGuard(e.guard, context)
    })

    // No branch matches — leave instance on the decision node (diagram error).
    if (outgoing.length === 0) break

    // Take first matching branch — guards are expected to be mutually exclusive.
    const [decEdgeId, decEdge] = outgoing[0]!

    newHistory.push(buildTransitionEvent(decEdgeId, currentNodeId, decEdge.to, event, context, true))
    effectsToFire.push(...(decEdge.effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: decEdgeId })))
    transitionsApplied.push({ edgeId: decEdgeId, fromNodeId: currentNodeId, toNodeId: decEdge.to })
    currentNodeId = decEdge.to
  }

  // ── Step 3: compute final status ─────────────────────────────────────────

  const finalNode = nodes[currentNodeId]
  const newStatus: InstanceStatus = finalNode?.type === 'end' ? 'completed' : 'active'

  const updatedInstance: WorkflowInstance = {
    ...instance,
    currentNodeId,
    status: newStatus,
    context,
    history: [...instance.history, ...newHistory],
    updatedAt: new Date().toISOString(),
  }

  const automationNodePending = finalNode?.type === 'automation' && finalNode.automationId
    ? { nodeId: currentNodeId, automationId: finalNode.automationId }
    : undefined

  return { ok: true, instance: updatedInstance, transitionsApplied, effectsToFire, automationNodePending }
}

// ─── Node config ──────────────────────────────────────────────────────────────

/**
 * Returns what a specific actor can do from the current node of an instance.
 * Used by apps to render only the actions available to the logged-in user.
 */
export function getNodeConfig(
  bep: BEP,
  instance: WorkflowInstance,
  actorEmail: string,
): NodeConfig {
  const workflow = bep.workflows.find(w => w.id === instance.workflowId)!
  const { nodes, edges } = workflow.diagram
  const currentNode = nodes[instance.currentNodeId]!

  // Resolve actor profile.
  const member      = bep.members.find(m => m.email === actorEmail)
  const actorRoleId = member?.roleId
  const actorTeamIds = new Set(
    bep.teams.filter(t => (t.memberEmails ?? []).includes(actorEmail)).map(t => t.id)
  )

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resolveRoles = (ids?: string[]): RoleRef[] =>
    (ids ?? []).flatMap(id => {
      const role = bep.roles.find(r => r.id === id)
      return role ? [{ id: role.id, name: role.name }] : []
    })

  const resolveTeams = (ids?: string[]): TeamRef[] =>
    (ids ?? []).flatMap(id => {
      const team = bep.teams.find(t => t.id === id)
      return team ? [{ id: team.id, name: team.name }] : []
    })

  const buildRaciLevel = (
    roleIds?: string[], teamIds?: string[], emails?: string[],
  ): RaciLevel => ({
    roles:  resolveRoles(roleIds),
    teams:  resolveTeams(teamIds),
    emails: emails ?? [],
  })

  /**
   * Three-level authorization check for a single RACI letter (R or A).
   * Only call this when the letter has at least one constraint defined.
   *   1. Email match — explicit member, always authorized.
   *   2. Team + Role — actor must be in a listed team AND have a listed role.
   *   3. Team only   — actor must be in a listed team.
   *   4. Role only   — actor must have a listed role.
   */
  const matchesConstraints = (
    roleIds?: string[], teamIds?: string[], emails?: string[],
  ): boolean => {
    if (emails?.includes(actorEmail)) return true
    const hasRoles = !!roleIds?.length
    const hasTeams = !!teamIds?.length
    if (hasTeams && hasRoles) {
      return (
        !!actorRoleId && roleIds!.includes(actorRoleId) &&
        teamIds!.some(tid => actorTeamIds.has(tid))
      )
    }
    if (hasTeams) return teamIds!.some(tid => actorTeamIds.has(tid))
    if (hasRoles) return !!actorRoleId && roleIds!.includes(actorRoleId)
    return false
  }

  const raciNode = currentNode.type === 'process' ? currentNode : null

  const hasResponsible = !!(
    raciNode?.responsibleRoleIds?.length ||
    raciNode?.responsibleTeamIds?.length ||
    raciNode?.responsibleEmails?.length
  )
  const hasAccountable = !!(
    raciNode?.accountableRoleIds?.length ||
    raciNode?.accountableTeamIds?.length ||
    raciNode?.accountableEmails?.length
  )

  // No R or A defined on the node → open to anyone.
  // Otherwise actor must satisfy at least one of the defined constraints.
  const actorIsAuthorized =
    (!hasResponsible && !hasAccountable) ||
    (hasResponsible && matchesConstraints(raciNode?.responsibleRoleIds, raciNode?.responsibleTeamIds, raciNode?.responsibleEmails)) ||
    (hasAccountable && matchesConstraints(raciNode?.accountableRoleIds, raciNode?.accountableTeamIds, raciNode?.accountableEmails))

  // Resolve required payload fields from the global FlowEvent catalog.
  const resolvePayload = (eventId: string) =>
    (bep.events.find(e => e.id === eventId)?.payload ?? []).map(p => ({
      key:      p.key,
      type:     p.type,
      required: p.required,
    }))

  const availableTransitions: NodeConfig['availableTransitions'] = []
  const blockedTransitions:   NodeConfig['blockedTransitions']   = []

  for (const [edgeId, edge] of Object.entries(edges)) {
    if (edge.from !== instance.currentNodeId) continue
    if (!('triggerEventId' in edge)) continue

    const eventId = edge.triggerEventId

    if (actorIsAuthorized) {
      availableTransitions.push({
        edgeId,
        label:           edge.label ?? eventId,
        emits:           eventId,
        requiredPayload: resolvePayload(eventId),
      })
    } else {
      blockedTransitions.push({
        edgeId,
        label:    edge.label ?? eventId,
        reason:   'UNAUTHORIZED',
        required: buildRaciLevel(
          [...(raciNode?.responsibleRoleIds ?? []), ...(raciNode?.accountableRoleIds ?? [])],
          [...(raciNode?.responsibleTeamIds ?? []), ...(raciNode?.accountableTeamIds ?? [])],
          [...(raciNode?.responsibleEmails  ?? []), ...(raciNode?.accountableEmails  ?? [])],
        ),
      })
    }
  }

  return {
    currentNode: {
      id:    instance.currentNodeId,
      type:  currentNode.type,
      label: instance.currentNodeId,
    },
    availableTransitions,
    blockedTransitions,
    raci: {
      responsible: buildRaciLevel(raciNode?.responsibleRoleIds, raciNode?.responsibleTeamIds, raciNode?.responsibleEmails),
      accountable:  buildRaciLevel(raciNode?.accountableRoleIds, raciNode?.accountableTeamIds, raciNode?.accountableEmails),
      consulted:    buildRaciLevel(raciNode?.consultedRoleIds,   raciNode?.consultedTeamIds,   raciNode?.consultedEmails),
      informed:     buildRaciLevel(raciNode?.informedRoleIds,    raciNode?.informedTeamIds,    raciNode?.informedEmails),
    },
    isTerminal: currentNode.type === 'end',
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildTransitionEvent(
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
  trigger: IncomingEvent,
  contextSnapshot: Record<string, unknown>,
  auto?: boolean,
): TransitionEvent {
  return {
    id:              globalThis.crypto.randomUUID(),
    edgeId,
    fromNodeId,
    toNodeId,
    trigger,
    actor:           trigger.actor,
    timestamp:       new Date().toISOString(),
    contextSnapshot: { ...contextSnapshot },
    ...(auto ? { auto: true } : {}),
  }
}
