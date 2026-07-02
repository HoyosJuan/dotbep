import { describe, it, expect } from 'vitest'
import { ACTOR, buildEffectBep, createTestEngine, externalAsset } from '../helpers.js'

describe('cancel()', () => {
  it('records the actor and appends a CancellationRecord, without checking authorization', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    // Note: cancelling as someone who never appears in the BEP at all — the engine does not object.
    await engine.workflows.cancel(instance!.id, 'anyone@example.com')

    const cancelled = await engine.workflows.get(instance!.id)
    expect(cancelled!.status).toBe('cancelled')

    const record = cancelled!.history.find(e => e.type === 'cancellation')
    expect(record).toMatchObject({ type: 'cancellation', actor: 'anyone@example.com' })
  })

  it('is a no-op on an instance that is not active', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.cancel(instance!.id, ACTOR)
    const afterFirstCancel = await engine.workflows.get(instance!.id)

    await engine.workflows.cancel(instance!.id, 'someone-else@example.com')
    const afterSecondCancel = await engine.workflows.get(instance!.id)

    // No second CancellationRecord was appended.
    expect(afterSecondCancel!.history).toEqual(afterFirstCancel!.history)
  })
})
