import { describe, it, expect } from 'vitest'
import { ACTOR, buildEffectBep, buildPayloadValidationBep, createTestEngine, externalAsset } from '../helpers.js'

describe('denied transitions', () => {
  it('UNAUTHORIZED — an actor without the required role is rejected, and the attempt is recorded', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: 'stranger@example.com' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('UNAUTHORIZED')

    // The instance did not move...
    const after = await engine.workflows.get(instance!.id)
    expect(after!.currentNodeId).toBe('resolve')

    // ...but the denied attempt is on the record.
    const denied = after!.history.at(-1)
    expect(denied).toMatchObject({ type: 'transitionDenied', reason: 'UNAUTHORIZED', actor: 'stranger@example.com', eventId: 'go' })
  })

  it('INVALID_PAYLOAD — a missing required field is rejected and recorded', async () => {
    const { bep, workflowId } = buildPayloadValidationBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR, payload: {} })

    expect(result.success).toBe(false)
    expect(result.error).toBe('INVALID_PAYLOAD')
    expect(result.payloadErrors).toEqual([{ field: 'comment', reason: 'missing' }])

    const after = await engine.workflows.get(instance!.id)
    expect(after!.history.at(-1)).toMatchObject({ type: 'transitionDenied', reason: 'INVALID_PAYLOAD' })
  })

  it('NO_MATCHING_EDGE — an event with no outgoing edge from the current node is rejected and recorded', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'does-not-exist', actor: ACTOR })

    expect(result.success).toBe(false)
    expect(result.error).toBe('NO_MATCHING_EDGE')

    const after = await engine.workflows.get(instance!.id)
    expect(after!.history.at(-1)).toMatchObject({ type: 'transitionDenied', reason: 'NO_MATCHING_EDGE' })
  })

  it('INSTANCE_NOT_ACTIVE — emitting against a cancelled instance is rejected and recorded', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.cancel(instance!.id, ACTOR)

    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(false)
    expect(result.error).toBe('INSTANCE_NOT_ACTIVE')

    const after = await engine.workflows.get(instance!.id)
    expect(after!.history.at(-1)).toMatchObject({ type: 'transitionDenied', reason: 'INSTANCE_NOT_ACTIVE' })
  })
})
