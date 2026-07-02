// Shared fixtures for engine tests — builds minimal BEPs and a configurable
// test Runtime, so individual test files only declare the handler behavior
// they care about instead of re-authoring a workflow every time.

import * as BEP from '../src/index.js'
import type { AutomationHandler, EffectHandler, WorkflowInstance } from '../src/index.js'

export const ACTOR = 'tester@test.com'

/**
 * Workflow with a single process step feeding two chained automation nodes:
 *
 *   start → resolve → auto1 → decision1 ─[ok1=false]→ end
 *                                        └[ok1=true]→ auto2 → decision2 ─[ok2=true]→ end
 *                                                                        └[ok2=false]→ resolve
 *
 * Registering only the `first` handler and guiding it to `ok1: false` exercises a single
 * automation in isolation. Registering both and guiding to `ok1: true` exercises chaining.
 */
export function buildAutomationChainBep() {
  const bep = BEP.Bep.create({ name: 'Automation test', code: 'AUTO', description: '' })

  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([
    { id: 'go', name: 'Go' },
    { id: 'first-done', name: 'First automation done', payload: [{ key: 'ok1', type: 'boolean', required: true }] },
    { id: 'second-done', name: 'Second automation done', payload: [{ key: 'ok2', type: 'boolean', required: true }] },
  ])

  bep.automations.add([
    { id: 'first', name: 'First', description: 'Test automation — first in the chain.', payload: [], output: [{ key: 'ok1', type: 'boolean', required: true }] },
    { id: 'second', name: 'Second', description: 'Test automation — second in the chain.', payload: [], output: [{ key: 'ok2', type: 'boolean', required: true }] },
  ])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Automation chain',
    diagram: {
      direction: 'LR',
      nodes: {
        start:     { type: 'start' },
        resolve:   { type: 'process', actionId, responsibleRoleIds: [roleId] },
        auto1:     { type: 'automation', automationId: 'first' },
        decision1: { type: 'decision', label: 'ok1?' },
        auto2:     { type: 'automation', automationId: 'second' },
        decision2: { type: 'decision', label: 'ok2?' },
        end:       { type: 'end' },
      },
      edges: {
        e1: { from: 'start',     to: 'resolve' },
        e2: { from: 'resolve',   to: 'auto1',   triggerEventId: 'go' },
        e3: { from: 'auto1',     to: 'decision1', triggerEventId: 'first-done' },
        e4: { from: 'decision1', to: 'auto2', guard: { field: 'ok1', operator: 'eq', value: true } },
        e5: { from: 'decision1', to: 'end',   guard: { field: 'ok1', operator: 'eq', value: false } },
        e6: { from: 'auto2',     to: 'decision2', triggerEventId: 'second-done' },
        e7: { from: 'decision2', to: 'end',     guard: { field: 'ok2', operator: 'eq', value: true } },
        e8: { from: 'decision2', to: 'resolve', guard: { field: 'ok2', operator: 'eq', value: false } },
      },
    },
  }]).succeeded

  return { bep, workflowId }
}

/**
 * Workflow with a single edge carrying an effect:
 *
 *   start → resolve ─[go, effect: my-effect]→ end
 */
export function buildEffectBep() {
  const bep = BEP.Bep.create({ name: 'Effect test', code: 'FX', description: '' })

  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([{ id: 'go', name: 'Go' }])
  bep.effects.add([{ id: 'my-effect', name: 'My effect', description: 'Test effect.', payload: [] }])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Effect test workflow',
    diagram: {
      direction: 'LR',
      nodes: {
        start:   { type: 'start' },
        resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
        end:     { type: 'end' },
      },
      edges: {
        e1: { from: 'start',   to: 'resolve' },
        e2: { from: 'resolve', to: 'end', triggerEventId: 'go', effectIds: ['my-effect'] },
      },
    },
  }]).succeeded

  return { bep, workflowId }
}

/**
 * Workflow whose single edge requires a payload field, for testing INVALID_PAYLOAD
 * rejections without touching the other builders' workflows.
 *
 *   start → resolve ─[go, requires "comment"]→ end
 */
export function buildPayloadValidationBep() {
  const bep = BEP.Bep.create({ name: 'Payload test', code: 'PAY', description: '' })

  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([{ id: 'go', name: 'Go', payload: [{ key: 'comment', type: 'string', required: true }] }])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Payload validation test',
    diagram: {
      direction: 'LR',
      nodes: {
        start:   { type: 'start' },
        resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
        end:     { type: 'end' },
      },
      edges: {
        e1: { from: 'start',   to: 'resolve' },
        e2: { from: 'resolve', to: 'end', triggerEventId: 'go' },
      },
    },
  }]).succeeded

  return { bep, workflowId }
}

/**
 * Workflow whose single process step is followed directly by a decision node,
 * for testing decision auto-traversal via a human-triggered event alone (no automations):
 *
 *   start → resolve ─[go]→ decision ─[approved=true]→ end
 *                                    └[approved=false]→ resolve
 */
export function buildDecisionBep() {
  const bep = BEP.Bep.create({ name: 'Decision test', code: 'DEC', description: '' })

  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([{ id: 'go', name: 'Go', payload: [{ key: 'approved', type: 'boolean', required: true }] }])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Decision test workflow',
    diagram: {
      direction: 'LR',
      nodes: {
        start:    { type: 'start' },
        resolve:  { type: 'process', actionId, responsibleRoleIds: [roleId] },
        decision: { type: 'decision', label: 'approved?' },
        end:      { type: 'end' },
      },
      edges: {
        e1: { from: 'start',    to: 'resolve' },
        e2: { from: 'resolve',  to: 'decision', triggerEventId: 'go' },
        e3: { from: 'decision', to: 'end',     guard: { field: 'approved', operator: 'eq', value: true } },
        e4: { from: 'decision', to: 'resolve', guard: { field: 'approved', operator: 'eq', value: false } },
      },
    },
  }]).succeeded

  return { bep, workflowId }
}

/**
 * Workflow with three process nodes covering every *schema-valid* RACI shape
 * the query engine's `pendingForActorQuery` needs to distinguish by matching
 * mechanism (role, team, or email):
 *
 *   start → byRole → byTeam → byEmail → end
 *
 * - byRole:  responsible by role (roleId), accountable by a *different* role (otherRoleId)
 * - byTeam:  responsible by team (teamId)
 * - byEmail: responsible by email (ACTOR)
 *
 * Note: a process node with no responsible at all (accountable-only, or fully
 * open) is not expressible through this authoring API — the schema requires
 * at least one responsible role/team/email on every process node. Tests that
 * need to exercise that (schema-invalid but defensively-handled) shape
 * construct a raw node directly instead of using this builder.
 *
 * Instances are placed directly at whichever node a test needs (not driven via emit()),
 * since this fixture exists to test the pure projection/query functions in isolation.
 */
export function buildQueryTestBep() {
  const bep = BEP.Bep.create({ name: 'Query test', code: 'QRY', description: '' })

  const [{ id: roleId }]      = bep.roles.add([{ name: 'Tester' }]).succeeded
  const [{ id: otherRoleId }] = bep.roles.add([{ name: 'Other' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: teamId }] = bep.teams.add([{ id: 'TM1', name: 'Team One', isoRole: 'appointed-party', memberEmails: [ACTOR] }]).succeeded
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([{ id: 'go', name: 'Go' }])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Query test workflow',
    diagram: {
      direction: 'LR',
      nodes: {
        start:   { type: 'start' },
        byRole:  { type: 'process', actionId, responsibleRoleIds: [roleId], accountableRoleIds: [otherRoleId] },
        byTeam:  { type: 'process', actionId, responsibleTeamIds: [teamId] },
        byEmail: { type: 'process', actionId, responsibleEmails: [ACTOR] },
        end:     { type: 'end' },
      },
      edges: {
        e1: { from: 'start',   to: 'byRole' },
        e2: { from: 'byRole',  to: 'byTeam',  triggerEventId: 'go' },
        e3: { from: 'byTeam',  to: 'byEmail', triggerEventId: 'go' },
        e4: { from: 'byEmail', to: 'end',     triggerEventId: 'go' },
      },
    },
  }]).succeeded

  return { bep, workflowId, roleId, otherRoleId, teamId }
}

export interface TestHandlers {
  automations?: Record<string, AutomationHandler>
  effects?: Record<string, EffectHandler>
}

class TestRuntime extends BEP.Runtime {
  constructor(handlers: TestHandlers) {
    super({})
    Object.assign(this.automations, handlers.automations ?? {})
    Object.assign(this.effects, handlers.effects ?? {})
  }
}

/** Initializes the BEP's engine with a test Runtime and in-memory storage, and returns it. */
export function createTestEngine(bep: BEP.Bep, handlers: TestHandlers = {}) {
  bep.engine.init({ runtime: new TestRuntime(handlers), storage: new BEP.MemoryStorage() })
  return bep.engine
}

export function externalAsset(label = 'Test asset'): WorkflowInstance['trackedAsset'] {
  return { source: 'external', url: 'https://example.com/test', label }
}

/**
 * Builds a WorkflowInstance sitting directly at a given node, without driving it
 * there via emit(). Useful for testing pure functions (getWorkflowStatus, the
 * query engine) against states that are awkward or impossible to reach through
 * the normal engine flow, e.g. a decision node (never a real resting point) or
 * an automation node with a hand-crafted history.
 */
export function instanceAt(workflowId: string, nodeId: string, overrides: Partial<WorkflowInstance> = {}): WorkflowInstance {
  const now = new Date().toISOString()
  return {
    id: 'test-instance',
    workflowId,
    trackedAsset: externalAsset(),
    currentNodeId: nodeId,
    status: 'active',
    history: [],
    createdAt: now,
    updatedAt: now,
    initiatedBy: ACTOR,
    ...overrides,
  }
}
