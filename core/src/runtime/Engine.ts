import type { BEP } from '../types/schema.js'
import { createInstance as _createInstance, processEvent, getNodeConfig as _getNodeConfig } from './transitions.js'
import { MemoryStorage } from './MemoryStorage.js'
import type { Runtime } from './Runtime.js'
import type {
  WorkflowInstance,
  IncomingEvent,
  InstanceFilter,
  NodeConfig,
  EffectOutcome,
  EventResult,
  InstanceStore,
  TransitionListener,
  LifecycleListener,
  EffectFailedListener,
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
 * In Node.js vm.createContext(), thrown Error objects have a different prototype
 * chain than the host's Error — instanceof checks fail. Access .message and .name
 * as plain properties instead.
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
  private runtime!:   Runtime<any>
  private storage!:   InstanceStore
  private skipRaci =  false

  private readonly transitionListeners:   TransitionListener[]   = []
  private readonly createdListeners:      LifecycleListener[]    = []
  private readonly completedListeners:    LifecycleListener[]    = []
  private readonly effectFailedListeners: EffectFailedListener[] = []

  /**
   * Called internally by Bep — injects the BEP data getter and history resolver.
   * Use bep.engine.init() to configure the runtime and storage before operating.
   */
  constructor(getBep: () => BEP, getHistoricalBep?: (version: string) => Promise<BEP>) {
    this.getBep           = getBep
    this.getHistoricalBep = getHistoricalBep
  }

  /**
   * Configures the engine with a runtime and storage backend.
   * Must be called before any operations (createInstance, emit, etc.).
   * Returns `this` for chaining.
   */
  init(config: EngineInitConfig): this {
    this.runtime  = config.runtime
    this.storage  = config.storage ?? new MemoryStorage()
    this.skipRaci = config.events?.skipRaci ?? false
    return this
  }

  // ─── Lifecycle listeners ─────────────────────────────────────────────────────

  /** Fires after every successful emit() — all listeners run concurrently. */
  onTransition(listener: TransitionListener): this {
    this.transitionListeners.push(listener)
    return this
  }

  /** Fires after createInstance() persists the new instance. */
  onInstanceCreated(listener: LifecycleListener): this {
    this.createdListeners.push(listener)
    return this
  }

  /** Fires when instance.status becomes 'completed'. */
  onInstanceCompleted(listener: LifecycleListener): this {
    this.completedListeners.push(listener)
    return this
  }

  /** Fires when an effect handler throws or returns status 'failed'. */
  onEffectFailed(listener: EffectFailedListener): this {
    this.effectFailedListeners.push(listener)
    return this
  }

  // ─── Operations ─────────────────────────────────────────────────────────────

  /**
   * Creates a new workflow instance positioned at the first node after start and persists it.
   * Records the current BEP version on the instance for historical resolution.
   * Returns null if the workflowId does not exist or has no start node.
   */
  async createInstance(
    workflowId: string,
    trackedAsset: WorkflowInstance['trackedAsset'],
    initiatedBy: string,
  ): Promise<WorkflowInstance | null> {
    this._assertInit()
    const bep        = this.getBep()
    const bepVersion = 'unversioned'
    const result     = _createInstance(bep, workflowId, trackedAsset, initiatedBy, bepVersion)
    if (!result) return null
    const { instance, startEffects } = result
    for (const ef of startEffects) {
      await this._executeEffect(instance, ef)
    }
    await this.storage.saveInstance(bep.project.code, instance)
    await this._fire(this.createdListeners, instance)
    return instance
  }

  /**
   * Emits an event against a workflow instance.
   *
   * 1. Loads the instance from storage.
   * 2. Resolves the BEP version the instance was created against.
   * 3. Processes the event (pure transition logic — transitions + decision auto-traversal).
   * 4. Persists the updated instance.
   * 5. Executes effect handlers declared in the runtime.
   * 6. Fires lifecycle listeners concurrently.
   * 7. Returns the result with the updated instance and effect outcomes.
   */
  async emit(instanceId: string, event: IncomingEvent): Promise<EventResult> {
    this._assertInit()
    const instance = await this.storage.getInstance(this.getBep().project.code, instanceId)
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

    // Auto-execute automation nodes — loop in case an automation leads to another automation
    const MAX_SERVICE_DEPTH = 10
    let serviceDepth = 0
    while (result.automationNodePending && serviceDepth++ < MAX_SERVICE_DEPTH) {
      const { automationId } = result.automationNodePending
      const { eventId, ...automationPayload } = await this._executeAutomationNode(current, automationId)

      result = processEvent(bep, current, {
        eventId,
        actor:      '_system',
        softwareId: '_system',
        payload:    automationPayload,
      })

      if (!result.ok) break

      current = result.instance!
      allTransitions.push(...(result.transitionsApplied ?? []))
      for (const ef of result.effectsToFire ?? []) {
        allEffects.push(await this._executeEffect(current, ef))
      }
    }

    await this.storage.saveInstance(bep.project.code, current)

    await this._fire(this.transitionListeners, current, allTransitions, allEffects)
    if (current.status === 'completed') {
      await this._fire(this.completedListeners, current)
    }

    return {
      ok:                 true,
      instance:           current,
      transitionsApplied: allTransitions,
      effects:            allEffects,
    }
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    this._assertInit()
    return this.storage.getInstance(this.getBep().project.code, instanceId)
  }

  /**
   * Returns instances matching the filter.
   * `pendingActionFor` (Member.email) is resolved at the Engine level using
   * the BEP RACI data — the storage layer does not need to understand it.
   */
  async getInstances(filter?: InstanceFilter): Promise<WorkflowInstance[]> {
    this._assertInit()
    const { pendingActionFor, ...storageFilter } = filter ?? {}
    const instances = await this.storage.listInstances(this.getBep().project.code, storageFilter)
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

  /**
   * Returns what a specific actor can do from the current node of an instance.
   * Returns null if the instance does not exist.
   */
  async getNodeConfig(instanceId: string, actorEmail: string): Promise<NodeConfig | null> {
    this._assertInit()
    const instance = await this.storage.getInstance(this.getBep().project.code, instanceId)
    if (!instance) return null
    const bep = await this._resolveBep(instance.bepVersion)
    return _getNodeConfig(bep, instance, actorEmail)
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this._assertInit()
    await this.storage.deleteInstance(this.getBep().project.code, instanceId)
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _assertInit(): void {
    if (!this.runtime || !this.storage) {
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
  ): Promise<{ eventId: string } & Record<string, unknown>> {
    const bep           = this.getBep()
    const automationDef = bep.automations.find(s => s.id === automationId)
    const fields        = automationDef?.payload ?? []
    const payload       = Object.fromEntries(fields.map(f => [f.key, instance.context[f.key]]))

    const handler = this.runtime.automations[automationId]
    if (!handler) throw new Error(`No handler declared for automation "${automationId}"`)
    return handler(instance, payload)
  }

  private async _executeEffect(
    instance: WorkflowInstance,
    ef: { effectId: string; fromEdgeId: string },
  ): Promise<EffectOutcome> {
    const bep       = this.getBep()
    const effectDef = bep.effects.find(e => e.id === ef.effectId)
    const fields    = effectDef?.payload ?? []

    const missing = fields
      .filter(f => f.required && instance.context[f.key] === undefined)
      .map(f => f.key)

    if (missing.length > 0) {
      return { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'skipped', missingFields: missing }
    }

    const handler = this.runtime.effects[ef.effectId]
    if (!handler) {
      return { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'skipped' }
    }

    const payload = Object.fromEntries(fields.map(f => [f.key, instance.context[f.key]]))

    try {
      await handler(instance, payload)
      return { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'executed' }
    } catch (error) {
      const outcome: EffectOutcome = { effectId: ef.effectId, fromEdgeId: ef.fromEdgeId, status: 'failed', error: serializeError(error) }
      await this._fire(this.effectFailedListeners, instance, outcome)
      return outcome
    }
  }
}
