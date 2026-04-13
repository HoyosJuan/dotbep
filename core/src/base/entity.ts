import { z, ZodError } from 'zod'
import type { BEP } from '../types/schema.js'
import { type ArrayKeys, checkRefs, checkOutgoingRefs } from '../utils/integrity.js'

function errMsg(e: unknown): string {
  if (e instanceof ZodError)
    return e.issues.map(i => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; ')
  return (e as Error).message
}

export type BulkResult<T> = {
  succeeded: T[]
  failed: { id: string; error: string }[]
}

/** Input type for add() on non-autoId entities — id is optional, validated by the Zod schema */
export type AddInput<T extends object> = Omit<T, 'id'> & { id?: string }

export type EntityConfig<T extends object, AutoId extends boolean = false> = {
  /** Key of this entity's array in BEP — used for automatic referential integrity checks */
  key: ArrayKeys<BEP>
  /** Field used as the unique identifier. Defaults to 'id' */
  idField?: keyof T
  /** Zod schema for this entity — used to validate input on add and merged result on update */
  schema: z.ZodType<T>
  /**
   * When true, a UUID is auto-generated for the id field.
   * add() will not accept an id in its input — callers capture it from the result.
   * Use for entities whose id is opaque (not part of nomenclature and not user-facing).
   */
  autoId?: AutoId
  /**
   * Custom validation called after schema parse (on add) and after merge (on update).
   * Use for nested reference checks not covered by the standard integrity rules.
   * Returns a list of error messages; empty array means valid.
   */
  validate?: (item: T, bep: BEP) => string[]
  /** Called before removing an entity, after ref checks pass. Use for custom logic not covered by integrity rules. */
  beforeRemove?: (id: string, bep: BEP) => void
}

export class Entity<T extends object, AutoId extends boolean = false> {
  private idField: keyof T

  constructor(
    private getItems: () => T[],
    protected getBep: () => BEP,
    private config: EntityConfig<T, AutoId>,
  ) {
    this.idField = config.idField ?? ('id' as keyof T)
  }

  private getId(entity: T): string {
    return String(entity[this.idField])
  }

  list(): T[] {
    return this.getItems()
  }

  get(ids: string[]): BulkResult<T> {
    const succeeded: T[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of ids) {
      const entity = this.getItems().find(e => this.getId(e) === id)
      if (entity) succeeded.push(entity)
      else failed.push({ id, error: `Not found: ${id}` })
    }
    return { succeeded, failed }
  }

  add(inputs: (AutoId extends true ? Omit<T, 'id'> : AddInput<T>)[]): BulkResult<T> {
    const succeeded: T[] = []
    const failed: { id: string; error: string }[] = []
    for (const input of inputs) {
      const raw = { ...input } as Record<string, unknown>
      if (this.config.autoId && !raw[this.idField as string])
        raw[this.idField as string] = globalThis.crypto.randomUUID()
      const id = String(raw[this.idField as string] ?? '(unknown)')
      try {
        const entity = this.config.schema.parse(raw)
        if (this.getItems().some(e => this.getId(e) === this.getId(entity)))
          throw new Error(`Already exists: ${this.getId(entity)}`)
        const outgoing = checkOutgoingRefs(entity as Record<string, unknown>, this.config.key, this.getBep())
        if (outgoing.length) throw new Error(outgoing.join('; '))
        const custom = this.config.validate?.(entity, this.getBep()) ?? []
        if (custom.length) throw new Error(custom.join('; '))
        this.getItems().push(entity)
        succeeded.push(entity)
      } catch (e) {
        failed.push({ id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }

  update(patches: ({ [K in keyof T]?: T[K] } & Record<string, unknown>)[]): BulkResult<T> {
    const succeeded: T[] = []
    const failed: { id: string; error: string }[] = []
    for (const patch of patches) {
      const id = String(patch[this.idField as string])
      const items = this.getItems()
      const index = items.findIndex(e => this.getId(e) === id)
      if (index === -1) {
        failed.push({ id, error: `Not found: ${id}` })
        continue
      }
      const outgoing = checkOutgoingRefs(patch as Record<string, unknown>, this.config.key, this.getBep())
      if (outgoing.length) {
        failed.push({ id, error: outgoing.join('; ') })
        continue
      }
      try {
        const merged = this.config.schema.parse({ ...items[index], ...patch })
        const custom = this.config.validate?.(merged, this.getBep()) ?? []
        if (custom.length) throw new Error(custom.join('; '))
        items[index] = merged
        succeeded.push(items[index])
      } catch (e) {
        failed.push({ id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }

  remove(ids: string[]): BulkResult<string> {
    const succeeded: string[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of ids) {
      const items = this.getItems()
      const index = items.findIndex(e => this.getId(e) === id)
      if (index === -1) {
        failed.push({ id, error: `Not found: ${id}` })
        continue
      }
      try {
        const active = checkRefs(id, this.config.key, this.getBep())
        if (active.length) throw new Error(`Referenced by: ${active.join(', ')}`)
        this.config.beforeRemove?.(id, this.getBep())
        items.splice(index, 1)
        succeeded.push(id)
      } catch (e) {
        failed.push({ id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }
}
