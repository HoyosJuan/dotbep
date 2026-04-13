import type { BEP, Phase } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { PhaseSchema } from '../types/schema.js'

export class Phases extends Entity<Phase, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().phases,
      getBep,
      {
        key: 'phases',
        schema: PhaseSchema,
        autoId: true,
      },
    )
  }
}
