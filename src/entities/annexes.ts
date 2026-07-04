import type { BEP, Annex } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { AnnexSchema } from '../types/schema.js'

export class Annexes extends Entity<Annex, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().annexes,
      getBep,
      {
        key: 'annexes',
        schema: AnnexSchema,
        autoId: true,
      },
    )
  }
}
