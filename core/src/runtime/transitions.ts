// Pure workflow engine — no I/O, no side effects.
// Takes BEP schema + instance state, returns new state + effects to fire.

import type { BEP, FlowEdge, EdgeGuard } from '../types/schema.js'
import type {
  IncomingEvent,
  TransitionRecord,
  WorkflowInstance,
  InstanceStatus,
  WorkflowStatus,
  AwaitingActionStatus,
  AutomationAttemptRecord,
  InstanceQueryRaciLevel,
  ProcessEventError,
  TransitionStep,
  PayloadFieldError,
} from './types.js'

// Safety limit to prevent infinite loops in malformed decision chains.
const MAX_DECISION_DEPTH = 10

// ─── Guard evaluation ─────────────────────────────────────────────────────────

/**
 * Applies a single field/operator/value comparison. Pure, and shared between
 * `evaluateGuard` (edge guards, evaluated against a flat event payload) and
 * the instance query engine (`query.ts`, evaluated against a nested,
 * BEP-resolved projection) — same operator vocabulary, different contexts.
 */
export function applyOperator(operator: string, val: unknown, expected: unknown): boolean {
  switch (operator) {
    case 'exists':   return val !== undefined && val !== null
    case 'eq':       return val === expected
    case 'neq':      return val !== expected
    case 'gt':       return typeof val === 'number' && typeof expected === 'number' && val > expected
    case 'lt':       return typeof val === 'number' && typeof expected === 'number' && val < expected
    case 'contains':
      if (typeof val === 'string' && typeof expected === 'string') return val.includes(expected)
      if (Array.isArray(val)) return (val as unknown[]).includes(expected)
      return false
    default:         return false
  }
}

/** Evaluates a guard condition against an event payload. Pure. */
export function evaluateGuard(guard: EdgeGuard, payload: Record<string, unknown>): boolean {
  return applyOperator(guard.operator, payload[guard.field], guard.value)
}

// ─── Authorization ────────────────────────────────────────────────────────────

/**
 * Returns true if the actor is authorized to act on a process node.
 *
 * Responsible has priority over accountable: if the node declares a
 * responsible party (role, team, or email), only that assignment is checked
 * — accountable is not a second way in, even if the actor happens to match
 * it. Accountable is only consulted as a fallback when the node declares no
 * responsible at all. If neither is declared, the node is open to anyone.
 */
function isActorAuthorized(bep: BEP, nodeId: string, workflowId: string, actorEmail: string): boolean {
  const workflow = bep.workflows.find(w => w.id === workflowId)
  const node = workflow?.diagram.nodes[nodeId]
  if (!node || node.type !== 'process') return true

  const hasResponsible = !!(node.responsibleRoleIds?.length || node.responsibleTeamIds?.length || node.responsibleEmails?.length)
  const hasAccountable = !!(node.accountableRoleIds?.length || node.accountableTeamIds?.length || node.accountableEmails?.length)
  if (!hasResponsible && !hasAccountable) return true

  const member     = bep.members.find(m => m.email === actorEmail)
  const actorRoleId = member?.roleId
  const actorTeamIds = new Set(bep.teams.filter(t => (t.memberEmails ?? []).includes(actorEmail)).map(t => t.id))

  const matches = (roleIds?: string[], teamIds?: string[], emails?: string[]): boolean => {
    if (emails?.includes(actorEmail)) return true
    const hasRoles = !!roleIds?.length
    const hasTeams = !!teamIds?.length
    if (hasTeams && hasRoles)
      return !!actorRoleId && roleIds!.includes(actorRoleId) && teamIds!.some(tid => actorTeamIds.has(tid))
    if (hasTeams) return teamIds!.some(tid => actorTeamIds.has(tid))
    if (hasRoles) return !!actorRoleId && roleIds!.includes(actorRoleId)
    return false
  }

  return hasResponsible
    ? matches(node.responsibleRoleIds, node.responsibleTeamIds, node.responsibleEmails)
    : matches(node.accountableRoleIds, node.accountableTeamIds, node.accountableEmails)
}

// ─── Payload validation ───────────────────────────────────────────────────────

const JS_TYPE: Record<string, string> = { string: 'string', number: 'number', boolean: 'boolean' }

function validatePayload(
  bep: BEP,
  eventId: string,
  payload: Record<string, unknown> | undefined,
): PayloadFieldError[] {
  const def = bep.events.find(e => e.id === eventId)
  if (!def?.payload?.length) return []

  const errors: PayloadFieldError[] = []
  const incoming = payload ?? {}

  for (const field of def.payload) {
    const val = incoming[field.key]
    if (val === undefined || val === null) {
      if (field.required) errors.push({ field: field.key, reason: 'missing' })
    } else {
      const expected = JS_TYPE[field.type]
      if (expected && typeof val !== expected) {
        errors.push({ field: field.key, reason: 'wrong_type' })
      } else if (field.type === 'string' && field.validation) {
        try {
          if (!new RegExp(field.validation.pattern, field.validation.flags).test(val as string)) {
            errors.push({ field: field.key, reason: 'invalid_format' })
          }
        } catch {
          // malformed regex — skip validation
        }
      }
    }
  }

  const declaredKeys = new Set(def.payload.map(f => f.key))
  for (const key of Object.keys(incoming)) {
    if (!declaredKeys.has(key)) errors.push({ field: key, reason: 'unknown_field' })
  }

  return errors
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
  success: boolean
  /** Updated instance. Present when success = true. */
  instance?: WorkflowInstance
  /** Ordered list of transitions applied (may include decision auto-traversals). */
  transitionsApplied?: TransitionStep[]
  /** Effects to execute after the transition. Caller is responsible for firing them. */
  effectsToFire?: { effectId: string; fromEdgeId: string; triggerPayload: Record<string, unknown> }[]
  /** Present when the final node is an automation node — Engine must execute the automation then emit the returned eventId. */
  automationNodePending?: { nodeId: string; automationId: string; triggerPayload: Record<string, unknown> }
  error?: ProcessEventError
  /** Present when error = 'INVALID_PAYLOAD'. */
  payloadErrors?: PayloadFieldError[]
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
): { instance: WorkflowInstance; startEffects: { effectId: string; fromEdgeId: string; triggerPayload: Record<string, unknown> }[] } | null {
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
    ? (startEdgeEntry[1].effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: startEdgeEntry[0], triggerPayload: {} as Record<string, unknown> }))
    : []

  const now = new Date().toISOString()
  return {
    instance: {
      id: globalThis.crypto.randomUUID(),
      workflowId,
      trackedAsset,
      currentNodeId: firstNodeId,
      status: 'active',
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
 * - Auto-traverses decision nodes using the same event payload.
 * - Returns the updated instance and the effects to fire. Pure — does not mutate.
 */
export function processEvent(
  bep: BEP,
  instance: WorkflowInstance,
  event: IncomingEvent,
  options?: { skipRaci?: boolean },
): ProcessEventResult {
  if (instance.status !== 'active') {
    return { success: false, error: 'INSTANCE_NOT_ACTIVE' }
  }

  if (!options?.skipRaci && !isActorAuthorized(bep, instance.currentNodeId, instance.workflowId, event.actor)) {
    return { success: false, error: 'UNAUTHORIZED' }
  }

  const workflow = bep.workflows.find(w => w.id === instance.workflowId)
  if (!workflow) return { success: false, error: 'NO_MATCHING_EDGE' }

  const { nodes, edges } = workflow.diagram

  // Working state — assembled immutably into the final instance at the end.
  let currentNodeId = instance.currentNodeId
  const newHistory: TransitionRecord[] = []
  const effectsToFire: { effectId: string; fromEdgeId: string; triggerPayload: Record<string, unknown> }[] = []
  const transitionsApplied: TransitionStep[] = []

  // ── Step 1: match an edge from the current node ───────────────────────────

  const candidates = Object.entries(edges).filter(
    ([, e]) => e.from === currentNodeId && edgeMatchesEvent(e, event),
  )

  if (candidates.length === 0) return { success: false, error: 'NO_MATCHING_EDGE' }
  if (candidates.length > 1)   return { success: false, error: 'AMBIGUOUS_TRANSITION' }

  const [edgeId, edge] = candidates[0]!

  if ('triggerEventId' in edge) {
    const payloadErrors = validatePayload(bep, edge.triggerEventId, event.payload)
    if (payloadErrors.length > 0) return { success: false, error: 'INVALID_PAYLOAD', payloadErrors }
  }

  newHistory.push(buildTransitionRecord(edgeId, currentNodeId, edge.to, event))
  effectsToFire.push(...(edge.effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: edgeId, triggerPayload: event.payload ?? {} })))
  transitionsApplied.push({ edgeId, fromNodeId: currentNodeId, toNodeId: edge.to })
  currentNodeId = edge.to

  // ── Step 2: auto-traverse decision nodes ─────────────────────────────────
  //
  // Decision nodes are never stable resting points — the engine evaluates their
  // outgoing edges immediately using the original event's payload.
  // Guards on outgoing decision edges should be mutually exclusive.

  let depth = 0
  while (nodes[currentNodeId]?.type === 'decision') {
    if (++depth > MAX_DECISION_DEPTH) return { success: false, error: 'DECISION_LOOP' }

    const outgoing = Object.entries(edges).filter(([, e]) => {
      if (e.from !== currentNodeId) return false
      if (!('guard' in e)) return false
      return evaluateGuard(e.guard, event.payload ?? {})
    })

    // No branch matches — leave instance on the decision node (diagram error).
    if (outgoing.length === 0) break

    // Take first matching branch — guards are expected to be mutually exclusive.
    const [decEdgeId, decEdge] = outgoing[0]!

    newHistory.push(buildTransitionRecord(decEdgeId, currentNodeId, decEdge.to, event, true))
    effectsToFire.push(...(decEdge.effectIds ?? []).map(effectId => ({ effectId, fromEdgeId: decEdgeId, triggerPayload: event.payload ?? {} })))
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
    history: [...instance.history, ...newHistory],
    updatedAt: new Date().toISOString(),
  }

  const automationNodePending = finalNode?.type === 'automation' && finalNode.automationId
    ? { nodeId: currentNodeId, automationId: finalNode.automationId, triggerPayload: event.payload ?? {} }
    : undefined

  return { success: true, instance: updatedInstance, transitionsApplied, effectsToFire, automationNodePending }
}

// ─── Workflow status ──────────────────────────────────────────────────────────

/**
 * Returns the current state of a workflow instance as one of a handful of
 * meaningful variants (awaiting a human, waiting on an automation, stranded
 * on a decision node, completed, cancelled) — see `WorkflowStatus`.
 * Actor-independent — authorization is enforced at emit() time, not here.
 * Deliberately thin: ids the caller can resolve themselves against the BEP
 * (role/team names, action/workflow details) are not duplicated here.
 */
export function getWorkflowStatus(
  bep: BEP,
  instance: WorkflowInstance,
): WorkflowStatus {
  const base = {
    instanceId:    instance.id,
    workflowId:    instance.workflowId,
    trackedAsset:  instance.trackedAsset,
    currentNodeId: instance.currentNodeId,
  }

  if (instance.status === 'completed') return { type: 'completed', ...base }
  if (instance.status === 'cancelled') return { type: 'cancelled', ...base }

  const workflow = bep.workflows.find(w => w.id === instance.workflowId)!
  const { nodes, edges } = workflow.diagram
  const currentNode = nodes[instance.currentNodeId]!

  if (currentNode.type === 'automation') {
    // Every entry since the transition that landed here — a success would have
    // already moved currentNodeId away, so anything found is a failed attempt.
    let arrivalIndex = -1
    for (let i = instance.history.length - 1; i >= 0; i--) {
      const entry = instance.history[i]!
      if (entry.type === 'transition' && entry.toNodeId === instance.currentNodeId) { arrivalIndex = i; break }
    }
    const attemptsSinceArrival = instance.history
      .slice(arrivalIndex + 1)
      .filter((e): e is Extract<AutomationAttemptRecord, { success: false }> =>
        e.type === 'automationAttempt' && e.nodeId === instance.currentNodeId && !e.success)

    return {
      type: 'automationPending',
      ...base,
      automation: {
        id: currentNode.automationId,
        failedAttemptsSinceArrival: attemptsSinceArrival.length,
        lastError: attemptsSinceArrival.at(-1)?.error,
      },
    }
  }

  if (currentNode.type === 'decision') return { type: 'stranded', ...base }

  if (currentNode.type !== 'process') return { type: 'stranded', ...base } // 'start'/'end' while active — shouldn't happen

  const raciLevel = (roleIds?: string[], teamIds?: string[], emails?: string[]): InstanceQueryRaciLevel => ({
    roleIds: roleIds ?? [], teamIds: teamIds ?? [], emails: emails ?? [],
  })

  const resolvePayload = (eventId: string) =>
    (bep.events.find(e => e.id === eventId)?.payload ?? []).map(p => ({
      key:      p.key,
      type:     p.type,
      required: p.required,
      label:    p.label,
    }))

  const transitions: AwaitingActionStatus['transitions'] = []
  for (const [edgeId, edge] of Object.entries(edges)) {
    if (edge.from !== instance.currentNodeId) continue
    if (!('triggerEventId' in edge)) continue
    const eventId = edge.triggerEventId
    transitions.push({ edgeId, emits: eventId, label: edge.label, requiredPayload: resolvePayload(eventId) })
  }

  return {
    type: 'awaitingAction',
    ...base,
    transitions,
    raci: {
      responsible: raciLevel(currentNode.responsibleRoleIds, currentNode.responsibleTeamIds, currentNode.responsibleEmails),
      accountable: raciLevel(currentNode.accountableRoleIds, currentNode.accountableTeamIds, currentNode.accountableEmails),
      consulted:   raciLevel(currentNode.consultedRoleIds,   currentNode.consultedTeamIds,   currentNode.consultedEmails),
      informed:    raciLevel(currentNode.informedRoleIds,    currentNode.informedTeamIds,    currentNode.informedEmails),
    },
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildTransitionRecord(
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
  trigger: IncomingEvent,
  auto?: boolean,
): TransitionRecord {
  return {
    type:      'transition',
    id:        globalThis.crypto.randomUUID(),
    edgeId,
    fromNodeId,
    toNodeId,
    trigger,
    actor:     trigger.actor,
    timestamp: new Date().toISOString(),
    ...(auto ? { auto: true } : {}),
  }
}
