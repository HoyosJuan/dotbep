import { describe, it, expect } from 'vitest'
import { evaluateGuard, createInstance, processEvent } from '../../src/runtime/transitions.js'
import { ACTOR, buildDecisionBep, buildEffectBep, buildPayloadValidationBep, buildQueryTestBep, externalAsset } from '../helpers.js'

describe('evaluateGuard', () => {
  it('returns true when an "eq" guard matches the payload', () => {
    const guard = { field: 'aprobado', operator: 'eq' as const, value: true }
    const payload = { aprobado: true }

    expect(evaluateGuard(guard, payload)).toBe(true)
  })

  it('returns false when an "eq" guard does not match the payload', () => {
    const guard = { field: 'aprobado', operator: 'eq' as const, value: true }
    const payload = { aprobado: false }

    expect(evaluateGuard(guard, payload)).toBe(false)
  })
})

describe('createInstance', () => {
  it('returns null when the workflow does not exist', () => {
    const { bep } = buildEffectBep()
    const result = createInstance(bep.data, 'nonexistent-workflow-id', externalAsset(), ACTOR)
    expect(result).toBeNull()
  })

  it('advances past the start node before the caller ever sees the instance, with empty history', () => {
    const { bep, workflowId } = buildEffectBep()
    const result = createInstance(bep.data, workflowId, externalAsset(), ACTOR)

    expect(result).not.toBeNull()
    expect(result!.instance.currentNodeId).toBe('resolve') // not 'start' — already advanced
    expect(result!.instance.status).toBe('active')
    expect(result!.instance.history).toEqual([]) // the start→resolve hop is not itself an event, so nothing is logged
    expect(result!.startEffects).toEqual([]) // that edge declares no effects in this fixture
  })
})

describe('processEvent', () => {
  it('rejects with INSTANCE_NOT_ACTIVE when the instance is not active', () => {
    const { bep, workflowId } = buildEffectBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!
    const inactive = { ...instance, status: 'completed' as const }

    const result = processEvent(bep.data, inactive, { eventId: 'go', actor: ACTOR })
    expect(result).toMatchObject({ success: false, error: 'INSTANCE_NOT_ACTIVE' })
  })

  it('rejects with UNAUTHORIZED when the actor does not satisfy the node\'s RACI', () => {
    const { bep, workflowId } = buildEffectBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'go', actor: 'stranger@example.com' })
    expect(result).toMatchObject({ success: false, error: 'UNAUTHORIZED' })
  })

  it('rejects with NO_MATCHING_EDGE when no outgoing edge matches the eventId', () => {
    const { bep, workflowId } = buildEffectBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'does-not-exist', actor: ACTOR })
    expect(result).toMatchObject({ success: false, error: 'NO_MATCHING_EDGE' })
  })

  it('rejects with INVALID_PAYLOAD when a required payload field is missing', () => {
    const { bep, workflowId } = buildPayloadValidationBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACTOR, payload: {} })
    expect(result).toMatchObject({
      success: false,
      error: 'INVALID_PAYLOAD',
      payloadErrors: [{ field: 'comment', reason: 'missing' }],
    })
  })

  it('on success, returns the updated instance with a TransitionRecord appended to history', () => {
    const { bep, workflowId } = buildEffectBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACTOR, payload: {} })

    expect(result.success).toBe(true)
    expect(result.instance!.currentNodeId).toBe('end')
    expect(result.instance!.status).toBe('completed')
    expect(result.instance!.history).toHaveLength(1)
    expect(result.instance!.history[0]).toMatchObject({
      type: 'transition', fromNodeId: 'resolve', toNodeId: 'end',
      trigger: { eventId: 'go', actor: ACTOR },
    })
  })

  it('auto-traverses a decision node in the same call, using the same event payload', () => {
    const { bep, workflowId } = buildDecisionBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACTOR, payload: { approved: true } })

    expect(result.success).toBe(true)
    expect(result.instance!.currentNodeId).toBe('end') // landed past the decision, not on it
    expect(result.instance!.history).toHaveLength(2)    // resolve→decision, then decision→end
    const [first, second] = result.instance!.history
    expect(first).toMatchObject({ type: 'transition', fromNodeId: 'resolve', toNodeId: 'decision' })
    if (first!.type !== 'transition') throw new Error('expected a transition record')
    expect(first.auto).toBeUndefined() // step 1 — not a decision auto-traversal
    expect(second).toMatchObject({ type: 'transition', fromNodeId: 'decision', toNodeId: 'end', auto: true })
  })

  it('takes the other decision branch when the guard evaluates to false', () => {
    const { bep, workflowId } = buildDecisionBep()
    const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)!

    const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACTOR, payload: { approved: false } })

    expect(result.instance!.currentNodeId).toBe('resolve') // looped back, not completed
    expect(result.instance!.status).toBe('active')
  })

  describe('authorization — responsible has priority over accountable', () => {
    it('rejects an actor who only matches accountable when a responsible party is declared', () => {
      const { bep, workflowId, otherRoleId } = buildQueryTestBep()
      const ACCOUNTABLE_ONLY = 'accountable-only@test.com'
      bep.members.add([{ email: ACCOUNTABLE_ONLY, name: 'Accountable Only', roleId: otherRoleId }])

      // 'byRole' declares responsible=roleId, accountable=otherRoleId.
      const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)! // start→byRole has no trigger, lands there directly
      const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACCOUNTABLE_ONLY })

      expect(result).toMatchObject({ success: false, error: 'UNAUTHORIZED' })
    })

    it('still authorizes the responsible party as before', () => {
      const { bep, workflowId } = buildQueryTestBep()
      const { instance } = createInstance(bep.data, workflowId, externalAsset(), ACTOR)! // start→byRole has no trigger, lands there directly

      const result = processEvent(bep.data, instance, { eventId: 'go', actor: ACTOR })
      expect(result.success).toBe(true)
    })

    it('falls back to accountable when the node declares no responsible at all (defensive path)', () => {
      const { bep, workflowId, roleId } = buildQueryTestBep()
      const data = structuredClone(bep.data)
      const node = data.workflows.find(w => w.id === workflowId)!.diagram.nodes['byRole'] as { responsibleRoleIds?: string[]; accountableRoleIds?: string[] }
      node.responsibleRoleIds = []
      node.accountableRoleIds = [roleId] // ACTOR holds this role

      const { instance } = createInstance(data, workflowId, externalAsset(), ACTOR)!
      const result = processEvent(data, instance, { eventId: 'go', actor: ACTOR })
      expect(result.success).toBe(true)
    })
  })
})
