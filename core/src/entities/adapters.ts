import type { BEP, Adapter } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { AdapterSchema } from '../types/schema.js'

export class Adapters extends Entity<Adapter> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().adapters,
      getBep,
      {
        key: 'adapters',
        schema: AdapterSchema,
      },
    )
  }
}
