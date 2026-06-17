import type { BEP } from '../types/schema.js'
import { createInstance as _createInstance, processEvent, getWorkflowStatus as _getWorkflowStatus } from './transitions.js'
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
  private readonly getBep:            () => BEP
  private readonly getHistoricalBep?: (version: string) => Promise<BEP>

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
    create(workflowId: string, trackedAsset: WorkflowInstance['trackedAsset'] | { rawPayload: unknown }, initiatedBy: string): Promise<WorkflowInstance | null>
    emit(instanceId: string, event: IncomingEvent): Promise<EventResult>
    get(instanceId: string): Promise<WorkflowInstance | null>
    list(filter?: InstanceFilter): Promise<WorkflowInstance[]>
    delete(instanceId: string): Promise<void>
    cancel(instanceId: string): Promise<void>
    getStatus(instanceId: string): Promise<WorkflowStatus | null>
    resolveContext(instanceId: string): Promise<Record<string, unknown>>
    onTransition(listener: TransitionListener): Engine
    onCreated(listener: LifecycleListener): Engine
    onCompleted(listener: LifecycleListener): Engine
    onCancelled(listener: LifecycleListener): Engine
    onEffectFailed(listener: EffectFailedListener): Engine
    onAutomationFailed(listener: AutomationFailedListener): Engine
  }

  constructor(getBep: () => BEP, getHistoricalBep?: (version: string) => Promise<BEP>) {
    this.getBep           = getBep
    this.getHistoricalBep = getHistoricalBep

    this.workflows = {
      create:            (wId, asset, by)  => this._create(wId, asset, by),
      emit:              (iId, event)      => this._emit(iId, event),
      get:               (iId)             => this._get(iId),
      list:              (filter)          => this._list(filter),
      delete:            (iId)             => this._delete(iId),
      cancel:            (iId)             => this._cancel(iId),
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
    workflowId: string,
    trackedAsset: WorkflowInstance['trackedAsset'] | { rawPayload: unknown },
    initiatedBy: string,
  ): Promise<WorkflowInstance | null> {
    this._assertInit()

    let resolvedAsset: WorkflowInstance['trackedAsset']
    if ('rawPayload' in trackedAsset) {
      const handler = this._runtime.triggers[workflowId]
      if (!handler) throw new Error(`No trigger handler declared for workflow "${workflowId}"`)
      resolvedAsset = await handler(trackedAsset.rawPayload)
      initiatedBy   = 'dotBEP'
    } else {
      resolvedAsset = trackedAsset
    }

    const bep        = this.getBep()
    const bepVersion = 'unversioned'
    const result     = _createInstance(bep, workflowId, resolvedAsset, initiatedBy, bepVersion)
    if (!result) return null
    const { instance, startEffects } = result
    for (const ef of startEffects) {
      await this._executeEffect(instance, ef)
    }

    const workflow  = bep.workflows.find(w => w.id === workflowId)
    const firstNode = workflow?.diagram.nodes[instance.currentNodeId]
    let automationPending = firstNode?.type === 'automation' && firstNode.automationId
      ? { automationId: firstNode.automationId, triggerPayload: {} as Record<string, unknown> }
      : undefined

    let current = instance
    const MAX_SERVICE_DEPTH = 10
    let serviceDepth = 0

    while (automationPending && serviceDepth++ < MAX_SERVICE_DEPTH) {
      const { automationId, triggerPayload } = automationPending
      const { eventId, ...automationPayload } = await this._executeAutomationNode(current, automationId, triggerPayload)
      const autoResult = processEvent(bep, current, {
        eventId,
        actor:      'dotBEP',
        softwareId: 'dotBEP',
        payload:    automationPayload,
      })
      if (!autoResult.ok) break
      current = autoResult.instance!
      for (const ef of autoResult.effectsToFire ?? []) {
        await this._executeEffect(current, ef)
      }
      automationPending = autoResult.automationNodePending
    }

    await this.storage.saveInstance(current)
    await this._fire(this._createdListeners, current)
    return current
  }

  private async _emit(instanceId: string, event: IncomingEvent): Promise<EventResult> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return { ok: false, error: 'NO_MATCHING_EDGE' }

    const bep = await this._resolveBep(instance.bepVersion)
    let result = processEvent(bep, instance, event, { skipRaci: this.skipRaci })
    if (!result.ok) return { ok: false, error: result.error, payloadErrors: result.payloadErrors }

    const allTransitions = [...(result.transitionsApplied ?? [])]
    const allEffects:     EffectOutcome[] = []

    let current = result.instance!

    for (const ef of result.effectsToFire ?? []) {
      allEffects.push(await this._executeEffect(current, ef))
    }

    const MAX_SERVICE_DEPTH = 10
    let serviceDepth = 0
    while (result.automationNodePending && serviceDepth++ < MAX_SERVICE_DEPTH) {
      const { automationId, triggerPayload } = result.automationNodePending
      const { eventId, ...automationPayload } = await this._executeAutomationNode(current, automationId, triggerPayload)

      result = processEvent(bep, current, {
        eventId,
        actor:      'dotBEP',
        softwareId: 'dotBEP',
        payload:    automationPayload,
      })

      if (!result.ok) break

      current = result.instance!
      allTransitions.push(...(result.transitionsApplied ?? []))
      for (const ef of result.effectsToFire ?? []) {
        allEffects.push(await this._executeEffect(current, ef))
      }
    }

    await this.storage.saveInstance(current)

    await this._fire(this._transitionListeners, current, allTransitions, allEffects)
    if (current.status === 'completed') {
      await this._fire(this._completedListeners, current)
    }

    return {
      ok:                 true,
      instance:           current,
      transitionsApplied: allTransitions,
      effects:            allEffects,
    }
  }

  private async _get(instanceId: string): Promise<WorkflowInstance | null> {
    this._assertInit()
    return this.storage.getInstance(instanceId)
  }

  private async _list(filter?: InstanceFilter): Promise<WorkflowInstance[]> {
    this._assertInit()
    const { pendingActionFor, ...storageFilter } = filter ?? {}
    const instances = await this.storage.listInstances(storageFilter)
    if (!pendingActionFor) return instances

    const bep    = this.getBep()
    const member = bep.members.find(m => m.email === pendingActionFor)
    if (!member) return []

    return instances.filter(instance => {
      const workflow = bep.workflows.find(w => w.id === instance.workflowId)
      if (!workflow) return false
      const node = workflow.diagram.nodes[instance.currentNodeId]
      if (!node) return false
      const raciNode = node.type === 'process' ? node : null
      const requiredRoleIds = [
        ...(raciNode?.responsibleRoleIds ?? []),
        ...(raciNode?.accountableRoleIds ?? []),
      ]
      return requiredRoleIds.length === 0 || requiredRoleIds.includes(member.roleId)
    })
  }

  private async _delete(instanceId: string): Promise<void> {
    this._assertInit()
    await this.storage.deleteInstance(instanceId)
  }

  private async _cancel(instanceId: string): Promise<void> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance || instance.status !== 'active') return
    const cancelled: WorkflowInstance = {
      ...instance,
      status:    'cancelled',
      updatedAt: new Date().toISOString(),
    }
    await this.storage.saveInstance(cancelled)
    await this._fire(this._cancelledListeners, cancelled)
  }

  private async _getStatus(instanceId: string): Promise<WorkflowStatus | null> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return null
    const bep = await this._resolveBep(instance.bepVersion)
    return _getWorkflowStatus(bep, instance)
  }

  private async _resolveContext(instanceId: string): Promise<Record<string, unknown>> {
    this._assertInit()
    const instance = await this.storage.getInstance(instanceId)
    if (!instance) return {}
    const result: Record<string, unknown> = {}
    for (const event of instance.history) {
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

  private async _resolveBep(bepVersion: string): Promise<BEP> {
    if (this.getHistoricalBep && bepVersion !== 'unversioned') {
      return this.getHistoricalBep(bepVersion)
    }
    return this.getBep()
  }

  private async _fire<A extends unknown[]>(
    listeners: ((...args: A) => Promise<void>)[],
    ...args: A
  ): Promise<void> {
    await Promise.allSettled(listeners.map(fn => fn(...args)))
  }

  private async _executeAutomationNode(
    instance: WorkflowInstance,
    automationId: string,
    triggerPayload: Record<string, unknown>,
  ): Promise<{ eventId: string } & Record<string, unknown>> {
    const handler = this._runtime.automations[automationId]
    if (!handler) throw new Error(`No handler declared for automation "${automationId}"`)
    try {
      return await handler(instance, triggerPayload)
    } catch (error) {
      await this._fire(this._automationFailedListeners, instance, automationId, serializeError(error))
      throw error
    }
  }

  private async _executeEffect(
    instance: WorkflowInstance,
    ef: { effectId: string; fromEdgeId: string; triggerPayload: Record<string, unknown> },
  ): Promise<EffectOutcome> {
    const handler = this._runtime.effects[ef.effectId]
    if (!handler) {
      return { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'skipped' }
    }

    try {
      await handler(instance, ef.triggerPayload)
      return { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'executed' }
    } catch (error) {
      const outcome: EffectOutcome = {
        effectId:    ef.effectId,
        fromEdgeId:  ef.fromEdgeId,
        status:      'failed',
        error:       serializeError(error),
      }
      await this._fire(this._effectFailedListeners, instance, outcome)
      return outcome
    }
  }
}
