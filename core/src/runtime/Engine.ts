import type { BEP } from '../types/schema.js'
import { createInstance as _createInstance, processEvent, getWorkflowStatus as _getWorkflowStatus } from './transitions.js'
import { buildInstanceProjection, matchesQuery } from './query.js'
import { MemoryStorage } from './MemoryStorage.js'
import type { Runtime } from './Runtime.js'
import type {
  WorkflowInstance,
  WorkflowStatus,
  EngineRef,
  IncomingEvent,
  InstanceFilter,
  EffectOutcome,
  EventResult,
  InstanceStore,
  TransitionListener,
  LifecycleListener,
  EffectFailedListener,
  AutomationFailedListener,
  TransitionStep,
  InstanceHistoryEntry,
  AutomationAttemptRecord,
  CancellationRecord,
  TransitionDeniedRecord,
  AutomationResult,
  EffectExecutionRecord,
} from './types.js'

export interface EngineInitConfig {
  /** The runtime that accompanies the BEP — declares effects, automations, etc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtime: Runtime<any>
  /** Storage backend for workflow instances. Defaults to in-memory. */
  storage?: InstanceStore
  /** Event-processing options. */
  events?: {
    /** Skip RACI authorization checks on emit(). Intended for local testing only. */
    skipRaci?: boolean
  }
}

/**
 * Serializes a caught error to a plain string, safe across VM realm boundaries.
 */
function serializeError(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err === 'string') return err
  const e = err as Record<string, unknown>
  const name = typeof e['name'] === 'string' ? e['name'] : 'Error'
  const msg  = typeof e['message'] === 'string' ? e['message'] : undefined
  if (msg !== undefined) return msg ? `${name}: ${msg}` : name
  try { return String(err) } catch { return 'Unknown error' }
}

export class Engine {
  private readonly getBep: () => BEP

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _runtime!:  Runtime<any>
  private storage!:   InstanceStore
  private skipRaci =  false

  // ── Listeners ─────────────────────────────────────────────────────────────
  private readonly _transitionListeners:       TransitionListener[]       = []
  private readonly _createdListeners:          LifecycleListener[]        = []
  private readonly _completedListeners:        LifecycleListener[]        = []
  private readonly _cancelledListeners:        LifecycleListener[]        = []
  private readonly _effectFailedListeners:     EffectFailedListener[]     = []
  private readonly _automationFailedListeners: AutomationFailedListener[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get runtime(): Runtime<any> { return this._runtime }

  /** Namespaced workflow instance operations. */
  readonly workflows: {
    create(id: string, trackedAsset: WorkflowInstance['trackedAsset'] | { rawPayload: unknown }, initiatedBy: string): Promise<WorkflowInstance | null>
    emit(instanceId: string, event: IncomingEvent): Promise<EventResult>
    get(instanceId: string): Promise<WorkflowInstance | null>
    list(filter?: InstanceFilter): Promise<WorkflowInstance[]>
    delete(instanceId: string): Promise<void>
    /** `actor` is recorded on the resulting `CancellationRecord` — the engine does not enforce who is allowed to cancel; that policy belongs to the consumer. */
    cancel(instanceId: string, actor: string): Promise<void>
    getStatus(instanceId: string): Promise<WorkflowStatus | null>
    resolveContext(instanceId: string): Promise<Record<string, unknown>>
    onTransition(listener: TransitionListener): Engine
    onCreated(listener: LifecycleListener): Engine
    onCompleted(listener: LifecycleListener): Engine
    onCancelled(listener: LifecycleListener): Engine
    onEffectFailed(listener: EffectFailedListener): Engine
    onAutomationFailed(listener: AutomationFailedListener): Engine
  }

  constructor(getBep: () => BEP) {
    this.getBep = getBep

    this.workflows = {
      create:            (wId, asset, by)  => this._create(wId, asset, by),
      emit:              (iId, event)      => this._emit(iId, event),
      get:               (iId)             => this._get(iId),
      list:              (filter)          => this._list(filter),
      delete:            (iId)             => this._delete(iId),
      cancel:            (iId, actor)      => this._cancel(iId, actor),
      getStatus:         (iId)             => this._getStatus(iId),
      resolveContext:    (iId)             => this._resolveContext(iId),
      onTransition:      (l)              => { this._transitionListeners.push(l);       return this },
      onCreated:         (l)              => { this._createdListeners.push(l);          return this },
      onCompleted:       (l)              => { this._completedListeners.push(l);        return this },
      onCancelled:       (l)              => { this._cancelledListeners.push(l);        return this },
      onEffectFailed:    (l)              => { this._effectFailedListeners.push(l);     return this },
      onAutomationFailed:(l)              => { this._automationFailedListeners.push(l); return this },
    }
  }

  /**
   * Configures the engine with a runtime and storage backend.
   * Must be called before any operations (workflows.create, workflows.emit, etc.).
   * Returns `this` for chaining.
   */
  init(config: EngineInitConfig): this {
    this._runtime = config.runtime
    this.storage  = config.storage ?? new MemoryStorage()
    this.skipRaci = config.events?.skipRaci ?? false
    // Inject engine reference into runtime so handlers can call this.engine.*
    ;(config.runtime as unknown as { _engine?: EngineRef })._engine = this
    return this
  }

  // ─── Remote data ──────────────────────────────────────────────────────────

  async getRemoteData(remoteDataId: string): Promise<unknown> {
    this._assertInit()
    const bep    = this.getBep()
    const remote = bep.remoteData.find(r => r.id === remoteDataId)
    if (!remote)            throw new Error(`Remote data "${remoteDataId}" not found in BEP`)
    if (!remote.resolverId) throw new Error(`Remote data "${remoteDataId}" has no resolver assigned`)
    return this._runtime._runResolver(remote.resolverId, remote.url)
  }

  // ─── Private workflow instance operations ─────────────────────────────────

  private async _create(
    id: string,
    trackedAsset: WorkflowInstance['trackedAsset'] | { rawPayload: unknown },
    initiatedBy: string,
  ): Promise<WorkflowInstance | null> {
    this._assertInit()

    let resolvedAsset: WorkflowInstance['trackedAsset']
    let workflowId: string
    if ('rawPayload' in trackedAsset) {
      // Trigger path: id is the softwareId; handler resolves both asset and workflowId.
      const handler = this._runtime.triggers[id]
      if (!handler) throw new Error(`No trigger handler declared for software "${id}"`)
      const resolved = await handler(trackedAsset.rawPayload)
      resolvedAsset  = resolved.trackedAsset
      workflowId     = resolved.workflowId
      initiatedBy    = 'dotBEP'
    } else {
      resolvedAsset = trackedAsset
      workflowId    = id
    }

    const bep    = this.getBep()
    const result = _createInstance(bep, workflowId, resolvedAsset, initiatedBy)
    if (!result) return null
    const { startEffects } = result
    let instance = result.instance
    for (const ef of startEffects) {
      ;({ instance } = await this._executeEffect(instance, ef))
    }

    const workflow  = bep.workflows.find(w => w.id === workflowId)
    const firstNode = workflow?.diagram.nodes[instance.currentNodeId]
    const pending = firstNode?.type === 'automation' && firstNode.automationId
      ? { automationId: firstNode.automationId, triggerPayload: {} as Record<string, unknown> }
      : undefined

    const transitions: TransitionStep[] = []
    const effects:     EffectOutcome[]  = []
    const current = await this._runAutomationChain(bep, instance, pending, transitions, effects)

    await this.storage.saveInstance(current)
    await this._fire(this._createdListeners, current)
    return current
  }

  private async _emit(instanceId: string, event: IncomingEvent): Promise<EventResult> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return { success: false, error: 'NO_MATCHING_EDGE' }

    const bep    = this.getBep()
    const result = processEvent(bep, instance, event, { skipRaci: this.skipRaci })
    if (!result.success) {
      // Record the denied attempt — it happened, even though nothing moved.
      const denied = this._appendHistory<TransitionDeniedRecord>(instance, {
        type:   'transitionDenied',
        reason: result.error!,
        actor:  event.actor,
        eventId: event.eventId,
      })
      await this.storage.saveInstance(denied)
      return { success: false, error: result.error, payloadErrors: result.payloadErrors }
    }

    const allTransitions = [...(result.transitionsApplied ?? [])]
    const allEffects:     EffectOutcome[] = []

    let current = result.instance!

    for (const ef of result.effectsToFire ?? []) {
      const executed = await this._executeEffect(current, ef)
      current = executed.instance
      allEffects.push(executed.outcome)
    }

    current = await this._runAutomationChain(bep, current, result.automationNodePending, allTransitions, allEffects)

    await this.storage.saveInstance(current)

    await this._fire(this._transitionListeners, current, allTransitions, allEffects)
    if (current.status === 'completed') {
      await this._fire(this._completedListeners, current)
    }

    return {
      success:            true,
      instance:           current,
      transitionsApplied: allTransitions,
      effects:            allEffects,
    }
  }

  /**
   * Drives an instance through zero or more automation nodes, starting from an
   * already-computed `pending` automation (if any). Persists the instance the
   * moment it arrives at each automation node — before running its handler —
   * so a failed execution never erases the record of how the instance got
   * there. Stops (without throwing) on the first failed attempt, leaving the
   * instance parked at that automation node with the failure recorded in
   * `history`.
   */
  private async _runAutomationChain(
    bep: BEP,
    current: WorkflowInstance,
    pending: { automationId: string; triggerPayload: Record<string, unknown> } | undefined,
    allTransitions: TransitionStep[],
    allEffects: EffectOutcome[],
  ): Promise<WorkflowInstance> {
    const MAX_SERVICE_DEPTH = 10
    let serviceDepth = 0

    while (pending && serviceDepth++ < MAX_SERVICE_DEPTH) {
      // Persist arrival at the automation node before executing it.
      await this.storage.saveInstance(current)

      const { automationId, triggerPayload } = pending
      const nodeId = current.currentNodeId
      const outcome = await this._executeAutomationNode(current, automationId, triggerPayload)

      if (!outcome.success) {
        current = this._appendHistory<AutomationAttemptRecord>(current, {
          type: 'automationAttempt', nodeId, automationId, success: false, error: outcome.error,
        })
        await this.storage.saveInstance(current)
        return current
      }

      const { success: _success, eventId, ...automationPayload } = outcome
      current = this._appendHistory<AutomationAttemptRecord>(current, {
        type: 'automationAttempt', nodeId, automationId, success: true,
      })

      const autoResult = processEvent(bep, current, {
        eventId,
        actor:      'dotBEP',
        softwareId: 'dotBEP',
        payload:    automationPayload,
      })
      if (!autoResult.success) return current

      current = autoResult.instance!
      allTransitions.push(...(autoResult.transitionsApplied ?? []))
      for (const ef of autoResult.effectsToFire ?? []) {
        const executed = await this._executeEffect(current, ef)
        current = executed.instance
        allEffects.push(executed.outcome)
      }
      pending = autoResult.automationNodePending
    }

    return current
  }

  private async _get(instanceId: string): Promise<WorkflowInstance | null> {
    this._assertInit()
    return this.storage.getInstance(instanceId)
  }

  private async _list(filter?: InstanceFilter): Promise<WorkflowInstance[]> {
    this._assertInit()
    const instances = await this.storage.listInstances()
    if (!filter?.where?.length) return instances

    const bep = this.getBep()
    return instances.filter(instance => matchesQuery(filter.where, buildInstanceProjection(bep, instance)))
  }

  private async _delete(instanceId: string): Promise<void> {
    this._assertInit()
    await this.storage.deleteInstance(instanceId)
  }

  private async _cancel(instanceId: string, actor: string): Promise<void> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance || instance.status !== 'active') return
    const cancelled = this._appendHistory<CancellationRecord>(
      { ...instance, status: 'cancelled', updatedAt: new Date().toISOString() },
      { type: 'cancellation', actor },
    )
    await this.storage.saveInstance(cancelled)
    await this._fire(this._cancelledListeners, cancelled)
  }

  private async _getStatus(instanceId: string): Promise<WorkflowStatus | null> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return null
    const bep = this.getBep()
    return _getWorkflowStatus(bep, instance)
  }

  private async _resolveContext(instanceId: string): Promise<Record<string, unknown>> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return {}
    const result: Record<string, unknown> = {}
    for (const event of instance.history) {
      if (event.type !== 'transition') continue
      Object.assign(result, event.trigger.payload ?? {})
    }
    return result
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private _assertInit(): void {
    if (!this._runtime || !this.storage) {
      throw new Error('Engine not initialized — call bep.engine.init({ runtime, storage }) first.')
    }
  }

  private async _fire<A extends unknown[]>(
    listeners: ((...args: A) => Promise<void>)[],
    ...args: A
  ): Promise<void> {
    await Promise.allSettled(listeners.map(fn => fn(...args)))
  }

  /**
   * Executes an automation handler and always resolves — never throws. A
   * missing handler, a declared `{ success: false }`, and an uncaught
   * exception are all normalized to the same `AutomationFailure` result, so
   * the caller has a single path to handle regardless of how the handler
   * failed.
   */
  private async _executeAutomationNode(
    instance: WorkflowInstance,
    automationId: string,
    triggerPayload: Record<string, unknown>,
  ): Promise<AutomationResult> {
    const handler = this._runtime.automations[automationId]
    if (!handler) {
      const error = `No handler declared for automation "${automationId}"`
      await this._fire(this._automationFailedListeners, instance, automationId, error)
      return { success: false, error }
    }
    try {
      return await handler(instance, triggerPayload)
    } catch (error) {
      const message = serializeError(error)
      await this._fire(this._automationFailedListeners, instance, automationId, message)
      return { success: false, error: message }
    }
  }

  /** Appends a new entry to `instance.history`, stamping `id` and `timestamp`. */
  private _appendHistory<E extends InstanceHistoryEntry>(
    instance: WorkflowInstance,
    entry: Omit<E, 'id' | 'timestamp'>,
  ): WorkflowInstance {
    const full = { ...entry, id: globalThis.crypto.randomUUID(), timestamp: new Date().toISOString() } as E
    return { ...instance, history: [...instance.history, full] }
  }

  /**
   * Executes an effect handler (fire-and-forget — never gates progress) and
   * records the outcome both as the return value (for the immediate caller,
   * e.g. `TransitionListener`) and as an `EffectExecutionRecord` appended to
   * `instance.history`, so a fire-and-forget effect leaves a durable trace
   * instead of vanishing once the `emit()`/`create()` call returns.
   */
  private async _executeEffect(
    instance: WorkflowInstance,
    ef: { effectId: string; fromEdgeId: string; triggerPayload: Record<string, unknown> },
  ): Promise<{ instance: WorkflowInstance; outcome: EffectOutcome }> {
    const handler = this._runtime.effects[ef.effectId]

    let outcome: EffectOutcome
    if (!handler) {
      outcome = {
        effectId:   ef.effectId,
        fromEdgeId: ef.fromEdgeId,
        success:    false,
        error:      `No handler registered for effect "${ef.effectId}"`,
      }
      await this._fire(this._effectFailedListeners, instance, outcome)
    } else {
      try {
        await handler(instance, ef.triggerPayload)
        outcome = { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, success: true }
      } catch (error) {
        outcome = {
          effectId:   ef.effectId,
          fromEdgeId: ef.fromEdgeId,
          success:    false,
          error:      serializeError(error),
        }
        await this._fire(this._effectFailedListeners, instance, outcome)
      }
    }

    const updated = this._appendHistory<EffectExecutionRecord>(instance, {
      type:       'effectExecution',
      effectId:   outcome.effectId,
      fromEdgeId: outcome.fromEdgeId,
      success:    outcome.success,
      error:      outcome.error,
    })
    return { instance: updated, outcome }
  }
}
