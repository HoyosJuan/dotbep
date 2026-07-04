import type { BEP, Objective } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { ObjectiveSchema } from '../types/schema.js'

export class Objectives extends Entity<Objective, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().objectives,
      getBep,
      {
        key: 'objectives',
        schema: ObjectiveSchema,
        autoId: true,
      },
    )
  }
}
