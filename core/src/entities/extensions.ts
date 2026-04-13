import type { BEP, Extension } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { ExtensionSchema } from '../types/schema.js'

export class Extensions extends Entity<Extension> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().extensions,
      getBep,
      {
        key: 'extensions',
        schema: ExtensionSchema,
      },
    )
  }
}
