import type { WorkflowInstance, EffectHandler, AutomationHandler, ResolverHandler, AdapterHandler } from './types.js'

export interface BepTypes {
  effects:     Record<string, Record<string, unknown>>
  automations: Record<string, Record<string, unknown>>
  resolvers:   Record<string, never>
  adapters:    Record<string, never>
}

type TypedEffectHandler<TPayload extends Record<string, unknown>> = (
  instance: WorkflowInstance,
  payload:  TPayload,
) => Promise<void>

type TypedAutomationHandler<TPayload extends Record<string, unknown>> = (
  instance: WorkflowInstance,
  payload:  TPayload,
) => Promise<{ eventId: string } & Record<string, unknown>>

/**
 * Base class for the runtime that accompanies a BEP.
 * Extend this class and register handlers in the constructor via
 * this.effect() and this.automation() for full payload type safety.
 *
 * @example
 * import type { BepTypes } from './bep.js'
 * import * as BEP from '@dotbep/core'
 *
 * class MyRuntime extends BEP.Runtime<BepTypes> {
 *   constructor(options: BEP.RuntimeOptions) {
 *     super(options)
 *     this.effect('send-email', async (instance, payload) => {
 *       const key = this.env.SENDGRID_KEY  // ← env disponible en todos los handlers
 *       await sendEmail(key, payload.to)
 *     })
 *     this.automation('check-approval', async (instance, payload) => {
 *       return { eventId: 'approved' }
 *     })
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
    handler: TypedEffectHandler<T['effects'][K]>,
  ): this {
    this.effects[key] = handler as EffectHandler
    return this
  }

  protected automation<K extends keyof T['automations'] & string>(
    key: K,
    handler: TypedAutomationHandler<T['automations'][K]>,
  ): this {
    this.automations[key] = handler as AutomationHandler
    return this
  }

  protected resolver<K extends keyof T['resolvers'] & string>(key: K, handler: ResolverHandler): this {
    this.resolvers[key] = handler
    return this
  }

  protected adapter<K extends keyof T['adapters'] & string>(key: K, handler: AdapterHandler): this {
    this.adapters[key] = handler
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
