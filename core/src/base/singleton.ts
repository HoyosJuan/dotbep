import { z } from 'zod'
import type { BEP } from '../types/schema.js'

export class Singleton<T extends object> {
  constructor(
    private getItem: () => T,
    private setItem: (value: T) => void,
    private schema: z.ZodType<T>,
    private validate?: (item: T, bep: BEP) => string[],
    private getBep?: () => BEP,
  ) {}

  get(): T {
    return this.getItem()
  }

  update(patch: { [K in keyof T]?: T[K] }): T {
    const merged = this.schema.parse({ ...this.getItem(), ...patch })
    if (this.validate && this.getBep) {
      const errors = this.validate(merged, this.getBep())
      if (errors.length) throw new Error(errors.join('; '))
    }
    this.setItem(merged)
    return merged
  }
}
