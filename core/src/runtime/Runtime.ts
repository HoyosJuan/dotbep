import type { WorkflowInstance, EffectHandler, AutomationHandler, ResolverHandler, TriggerHandler, EngineRef } from './types.js'

export interface BepTypes {
  effects:     Record<string, (...args: any[]) => void>
  automations: Record<string, (...args: any[]) => { eventId: string } & Record<string, unknown>>
  resolvers:   Record<string, (url: string, ...args: any[]) => unknown>
  triggers:    Record<string, (rawPayload: unknown) => Promise<WorkflowInstance['trackedAsset']>>
  env:         Record<string, string>
}

/**
 * Base class for the runtime that accompanies a BEP.
 * Extend this class and register handlers in the constructor.
 * Pass the generated BepTypes as the generic parameter for full type safety.
 *
 * @example
 * import type { BepTypes } from './bep.js'
 * import * as BEP from '@dotbep/core'
 *
 * class MyRuntime extends BEP.Runtime<BepTypes> {
 *   constructor(options: BEP.RuntimeOptions) {
 *     super(options)
 *     this.effect('send-email', async (instance, payload) => {
 *       await sendEmail(this.env.SENDGRID_KEY, payload.to)
 *     })
 *     this.automation('check-approval', async (instance) => {
 *       return { eventId: 'approved' }
 *     })
 *     this.resolver('fetch-data', async (url) => {
 *       return fetch(url).then(r => r.json())
 *     })
 *     this.adapter('to-chart', (data) => data)
 *   }
 * }
 *
 * bep.engine.init({ runtime: new MyRuntime({ env: process.env }) })
 */
export interface RuntimeOptions {
  env?: Record<string, string>
}

export class Runtime<T extends {
  effects:     Record<string, any>
  automations: Record<string, any>
  resolvers:   Record<string, any>
  triggers:    Record<string, any>
  env:         Record<string, any>
} = BepTypes> {
  env: T['env']

  readonly effects:     Record<string, EffectHandler>     = {}
  readonly automations: Record<string, AutomationHandler> = {}
  readonly resolvers:   Record<string, ResolverHandler>   = {}
  readonly triggers:    Record<string, TriggerHandler>    = {}

  /** Set by Engine.init() — available inside handlers via this.engine */
  _engine: EngineRef | null = null
  get engine(): EngineRef {
    if (!this._engine) throw new Error('engine is not available yet — it is set during Engine.init()')
    return this._engine
  }

  constructor({ env = {} }: RuntimeOptions = {}) {
    this.env = env
  }

  protected effect<K extends keyof T['effects'] & string>(
    key: K,
    handler: (instance: WorkflowInstance, ...args: Parameters<T['effects'][K]>) => Promise<void>,
  ): this {
    this.effects[key] = handler as unknown as EffectHandler
    return this
  }

  protected automation<K extends keyof T['automations'] & string>(
    key: K,
    handler: (instance: WorkflowInstance, ...args: Parameters<T['automations'][K]>) => Promise<ReturnType<T['automations'][K]>>,
  ): this {
    this.automations[key] = handler as unknown as AutomationHandler
    return this
  }

  protected resolver<K extends keyof T['resolvers'] & string>(
    key: K,
    handler: (...args: Parameters<T['resolvers'][K]>) => Promise<ReturnType<T['resolvers'][K]>>,
  ): this {
    this.resolvers[key] = handler as unknown as ResolverHandler
    return this
  }

  protected trigger<K extends keyof T['triggers'] & string>(
    key: K,
    handler: (rawPayload: unknown) => Promise<WorkflowInstance['trackedAsset']>,
  ): this {
    this.triggers[key] = handler as unknown as TriggerHandler
    return this
  }

  /** @internal Called by Engine.getRemoteData — keeps env encapsulated inside the Runtime. */
  _runResolver(id: string, url: string): Promise<unknown> {
    const handler = this.resolvers[id]
    if (!handler) throw new Error(`No handler declared for resolver "${id}"`)
    return handler(url, this.env)
  }

}

// Untyped aliases used internally by Engine (which works with the base contract)
export type { EffectHandler, AutomationHandler, ResolverHandler, TriggerHandler }
