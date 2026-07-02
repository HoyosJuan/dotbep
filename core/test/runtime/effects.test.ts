import { describe, it, expect } from 'vitest'
import { ACTOR, buildEffectBep, createTestEngine, externalAsset } from '../helpers.js'

describe('effects', () => {
  it('a successful effect executes and is recorded in history, without blocking the transition', async () => {
    const { bep, workflowId } = buildEffectBep()
    let called = false
    const engine = createTestEngine(bep, {
      effects: { 'my-effect': async () => { called = true } },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(called).toBe(true)
    expect(result.instance!.status).toBe('completed') // the transition completes regardless
    expect(result.effects).toEqual([{ effectId: 'my-effect', fromEdgeId: 'e2', success: true }])

    const record = result.instance!.history.find(e => e.type === 'effectExecution')
    expect(record).toMatchObject({ effectId: 'my-effect', fromEdgeId: 'e2', success: true })
  })

  it('a thrown exception is caught, recorded as a failure, and still does not block the transition', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep, {
      effects: { 'my-effect': async () => { throw new Error('notification service down') } },
    })

    let failedOutcome: { error?: string } | undefined
    engine.workflows.onEffectFailed(async (_instance, outcome) => { failedOutcome = outcome })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.instance!.status).toBe('completed') // effects never gate progress
    expect(result.effects![0]).toMatchObject({ effectId: 'my-effect', success: false })
    expect(result.effects![0].error).toContain('notification service down')

    const record = result.instance!.history.find(e => e.type === 'effectExecution')
    expect(record).toMatchObject({ success: false })

    expect(failedOutcome?.error).toContain('notification service down')
  })

  it('a missing handler is also treated as a failure and fires onEffectFailed', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep) // no effect handlers registered

    let failedOutcome: { error?: string } | undefined
    engine.workflows.onEffectFailed(async (_instance, outcome) => { failedOutcome = outcome })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.instance!.status).toBe('completed')
    expect(result.effects![0]).toMatchObject({ effectId: 'my-effect', success: false })
    expect(result.effects![0].error).toMatch(/no handler registered/i)
    expect(failedOutcome?.error).toMatch(/no handler registered/i)
  })
})
