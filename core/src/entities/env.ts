import type { BEP, EnvVar } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { EnvVarSchema } from '../types/schema.js'

export class Env extends Entity<EnvVar> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().env,
      getBep,
      {
        key: 'env',
        idField: 'key',
        schema: EnvVarSchema,
      },
    )
  }
}
