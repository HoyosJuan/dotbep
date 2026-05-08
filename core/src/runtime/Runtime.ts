import type { WorkflowInstance, EffectHandler, AutomationHandler, ResolverHandler, AdapterHandler } from './types.js'

export interface BepTypes {
  effects:     Record<string, (...args: any[]) => void>
  automations: Record<string, (...args: any[]) => { eventId: string } & Record<string, unknown>>
  resolvers:   Record<string, (url: string, ...args: any[]) => unknown>
  adapters:    Record<string, (data: unknown) => unknown>
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
  adapters:    Record<string, any>
} = BepTypes> {
  protected readonly env: Record<string, string>

  readonly effects:     Record<string, EffectHandler>     = {}
  readonly automations: Record<string, AutomationHandler> = {}
  readonly resolvers:   Record<string, ResolverHandler>   = {}
  readonly adapters:    Record<string, AdapterHandler>    = {}

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

  protected adapter<K extends keyof T['adapters'] & string>(
    key: K,
    handler: (...args: Parameters<T['adapters'][K]>) => ReturnType<T['adapters'][K]>,
  ): this {
    this.adapters[key] = handler as unknown as AdapterHandler
    return this
  }

  /** @internal Called by Engine.getRemoteData — keeps env encapsulated inside the Runtime. */
  _runResolver(id: string, url: string): Promise<unknown> {
    const handler = this.resolvers[id]
    if (!handler) throw new Error(`No handler declared for resolver "${id}"`)
    return handler(url, this.env)
  }

  /** @internal Called by Engine.useAdapter — keeps handler lookup inside the Runtime. */
  _runAdapter(id: string, data: unknown): unknown {
    const handler = this.adapters[id]
    if (!handler) throw new Error(`No handler declared for adapter "${id}"`)
    return handler(data)
  }
}

// Untyped aliases used internally by Engine (which works with the base contract)
export type { EffectHandler, AutomationHandler, ResolverHandler, AdapterHandler }
