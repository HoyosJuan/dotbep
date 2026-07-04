import { describe, it, expect, vi } from 'vitest'
import type { InstanceStore, WorkflowInstance } from '../../src/index.js'
import { MemoryStorage } from '../../src/index.js'
import { ACTOR, buildAutomationChainBep, createTestEngine, externalAsset } from '../helpers.js'

describe('automation nodes — single automation', () => {
  it('a successful automation advances past it and records the attempt in history', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => ({ success: true, eventId: 'first-done', ok1: false }), // routes straight to end
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(true)
    expect(result.instance!.status).toBe('completed')
    expect(result.instance!.currentNodeId).toBe('end')

    const attempt = result.instance!.history.find(e => e.type === 'automationAttempt')
    expect(attempt).toMatchObject({ nodeId: 'auto1', automationId: 'first', success: true })
    // Not `error: undefined` — the key must be absent entirely, or storage backends that
    // reject explicit `undefined` (e.g. Firestore) throw when persisting this record.
    expect(attempt).not.toHaveProperty('error')
  })

  it('a declared failure parks the instance at the automation node and records why', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => ({ success: false, error: 'ACC API timeout' }),
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(true) // the emit() call itself succeeded — it's the automation that failed
    expect(result.instance!.status).toBe('active')
    expect(result.instance!.currentNodeId).toBe('auto1')

    const last = result.instance!.history.at(-1)
    expect(last).toMatchObject({ type: 'automationAttempt', nodeId: 'auto1', automationId: 'first', success: false, error: 'ACC API timeout' })
  })

  it('an uncaught exception is normalized to the same failure shape as a declared one', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => { throw new Error('kaboom') },
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.instance!.currentNodeId).toBe('auto1')
    const last = result.instance!.history.at(-1)
    expect(last).toMatchObject({ type: 'automationAttempt', success: false })
    expect((last as { error?: string }).error).toContain('kaboom')
  })

  it("a successful automation whose emitted event matches no edge is recorded, not silently dropped", async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        // The handler ran fine, but 'first' only has an edge for 'first-done' — this eventId matches nothing.
        first: async () => ({ success: true, eventId: 'no-such-event', ok1: true }),
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(true) // the emit() call itself succeeded — the automation ran
    expect(result.instance!.currentNodeId).toBe('auto1') // ...but nothing moved past it

    const attempt = result.instance!.history.find(e => e.type === 'automationAttempt')
    expect(attempt).toMatchObject({ nodeId: 'auto1', automationId: 'first', success: true })

    const denied = result.instance!.history.at(-1)
    expect(denied).toMatchObject({ type: 'transitionDenied', reason: 'NO_MATCHING_EDGE', actor: 'dotBEP', eventId: 'no-such-event' })
  })

  it('a missing handler is treated as a failure, not an unhandled exception', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep) // no handlers registered at all

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(true)
    expect(result.instance!.currentNodeId).toBe('auto1')
    const last = result.instance!.history.at(-1)
    expect(last).toMatchObject({ type: 'automationAttempt', success: false })
    expect((last as { error?: string }).error).toMatch(/no handler declared/i)
  })
})

describe('automation nodes — chained', () => {
  it('two automations in a row both succeed and the instance reaches the end', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first:  async () => ({ success: true, eventId: 'first-done',  ok1: true }),
        second: async () => ({ success: true, eventId: 'second-done', ok2: true }),
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.instance!.status).toBe('completed')
    expect(result.instance!.currentNodeId).toBe('end')

    const attempts = result.instance!.history.filter(e => e.type === 'automationAttempt')
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatchObject({ automationId: 'first',  success: true })
    expect(attempts[1]).toMatchObject({ automationId: 'second', success: true })
  })

  it("when the second automation fails, the first one's success stays recorded", async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first:  async () => ({ success: true, eventId: 'first-done', ok1: true }),
        second: async () => ({ success: false, error: 'second failed' }),
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    // Parked at the second automation, not reverted all the way back.
    expect(result.instance!.currentNodeId).toBe('auto2')

    const attempts = result.instance!.history.filter(e => e.type === 'automationAttempt')
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatchObject({ automationId: 'first',  success: true })
    expect(attempts[1]).toMatchObject({ automationId: 'second', success: false })
  })
})

describe('automation nodes — arrival persistence', () => {
  /** Wraps MemoryStorage and throws on a chosen save call, to simulate a crash mid-execution. */
  class FlakyStorage implements InstanceStore {
    private inner = new MemoryStorage()
    private saveCount = 0
    constructor(private failOnSaveNumber: number) {}
    listInstances: InstanceStore['listInstances'] = () => this.inner.listInstances()
    getInstance:   InstanceStore['getInstance']   = id => this.inner.getInstance(id)
    deleteInstance: InstanceStore['deleteInstance'] = id => this.inner.deleteInstance(id)
    async saveInstance(instance: WorkflowInstance): Promise<void> {
      this.saveCount++
      if (this.saveCount === this.failOnSaveNumber) throw new Error('storage unavailable')
      return this.inner.saveInstance(instance)
    }
    /** Reads the raw underlying state, bypassing the failure simulation. */
    readRaw(id: string) { return this.inner.getInstance(id) }
  }

  it('persists arrival at the automation node even if a later save in the same call fails', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    // save #1 = end of create() (instance still at 'resolve'); save #2 = arrival at auto1 (must succeed);
    // save #3 = after the failed attempt is appended (made to fail, to prove save #2 already landed).
    const storage = new FlakyStorage(3)
    const engine = createTestEngine(bep, {
      automations: { first: async () => ({ success: false, error: 'boom' }) },
    })
    // Swap in the flaky storage after createTestEngine's default init.
    engine.init({ runtime: engine.runtime, storage })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await expect(engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })).rejects.toThrow('storage unavailable')

    const raw = await storage.readRaw(instance!.id)
    expect(raw!.currentNodeId).toBe('auto1')
    // The transition that landed on auto1 made it through — the failed attempt on top of it did not.
    expect(raw!.history.some(e => e.type === 'transition' && e.toNodeId === 'auto1')).toBe(true)
    expect(raw!.history.some(e => e.type === 'automationAttempt')).toBe(false)
  })
})

describe('retryAutomation', () => {
  it('re-runs the handler at the current node with the payload that originally landed it there', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    let call = 0
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => {
          call++
          return call === 1 ? { success: false, error: 'ACC API timeout' } : { success: true, eventId: 'first-done', ok1: false }
        },
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const first = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })
    expect(first.instance!.currentNodeId).toBe('auto1')

    const retried = await engine.workflows.retryAutomation(instance!.id)

    expect(retried.success).toBe(true)
    expect(retried.instance!.status).toBe('completed')
    expect(retried.instance!.currentNodeId).toBe('end')

    const attempts = retried.instance!.history.filter(e => e.type === 'automationAttempt')
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatchObject({ automationId: 'first', success: false })
    expect(attempts[1]).toMatchObject({ automationId: 'first', success: true })
  })

  it('does not fire onTransition — it is not a transition, just a re-execution', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    let call = 0
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => {
          call++
          return call === 1 ? { success: false, error: 'boom' } : { success: true, eventId: 'first-done', ok1: false }
        },
      },
    })
    const onTransition = vi.fn(async () => {})
    engine.workflows.onTransition(onTransition)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })
    onTransition.mockClear()

    await engine.workflows.retryAutomation(instance!.id)

    expect(onTransition).not.toHaveBeenCalled()
  })

  it('fails with NOT_AT_AUTOMATION_NODE when the instance is not parked at an automation node', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep)
    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)

    const result = await engine.workflows.retryAutomation(instance!.id)

    expect(result).toEqual({ success: false, error: 'NOT_AT_AUTOMATION_NODE' })
  })
})

describe('revertAutomation', () => {
  it('moves the instance back to the process node that fed the automation, recording a RevertRecord', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: { first: async () => ({ success: false, error: 'ACC API timeout' }) },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    const result = await engine.workflows.revertAutomation(instance!.id, ACTOR)

    expect(result.success).toBe(true)
    expect(result.instance!.currentNodeId).toBe('resolve')
    expect(result.instance!.status).toBe('active')

    const revert = result.instance!.history.at(-1)
    expect(revert).toMatchObject({ type: 'automationRevert', fromNodeId: 'auto1', toNodeId: 'resolve', actor: ACTOR })

    // Prior attempts stay in history — nothing is erased.
    expect(result.instance!.history.some(e => e.type === 'automationAttempt' && e.success === false)).toBe(true)
  })

  it('does not fire onTransition — it only moves the pointer', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: { first: async () => ({ success: false, error: 'boom' }) },
    })
    const onTransition = vi.fn(async () => {})
    engine.workflows.onTransition(onTransition)

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })
    onTransition.mockClear()

    await engine.workflows.revertAutomation(instance!.id, ACTOR)

    expect(onTransition).not.toHaveBeenCalled()
  })

  it('allows re-emitting the original event after reverting, as if it never reached the automation', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    let call = 0
    const engine = createTestEngine(bep, {
      automations: {
        first: async () => {
          call++
          return call === 1 ? { success: false, error: 'boom' } : { success: true, eventId: 'first-done', ok1: false }
        },
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })
    await engine.workflows.revertAutomation(instance!.id, ACTOR)

    const result = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(result.success).toBe(true)
    expect(result.instance!.status).toBe('completed')
  })

  it('fails with NOT_AT_AUTOMATION_NODE when the instance is not parked at an automation node', async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep)
    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)

    const result = await engine.workflows.revertAutomation(instance!.id, ACTOR)

    expect(result).toEqual({ success: false, error: 'NOT_AT_AUTOMATION_NODE' })
  })

  it("fails with NO_REVERTIBLE_PREDECESSOR when the predecessor isn't a process node", async () => {
    const { bep, workflowId } = buildAutomationChainBep()
    const engine = createTestEngine(bep, {
      automations: {
        first:  async () => ({ success: true, eventId: 'first-done', ok1: true }), // routes to auto2 via decision1
        second: async () => ({ success: false, error: 'boom' }),
      },
    })

    const instance = await engine.workflows.create(workflowId, externalAsset(), ACTOR)
    const emitted = await engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })
    expect(emitted.instance!.currentNodeId).toBe('auto2') // preceded by decision1, not a process node

    const result = await engine.workflows.revertAutomation(instance!.id, ACTOR)

    expect(result).toEqual({ success: false, error: 'NO_REVERTIBLE_PREDECESSOR' })
  })
})
