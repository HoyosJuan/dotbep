import type { BEP, Flag } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { FlagSchema } from '../types/schema.js'

export class Flags extends Entity<Flag, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().flags,
      getBep,
      {
        key: 'flags',
        schema: FlagSchema,
        autoId: true,
      },
    )
  }
}
