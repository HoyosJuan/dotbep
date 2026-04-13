import type { BEP, Discipline } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { DisciplineSchema } from '../types/schema.js'
import { validateTokenValue } from '../utils/naming.js'

export class Disciplines extends Entity<Discipline> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().disciplines,
      getBep,
      {
        key: 'disciplines',
        schema: DisciplineSchema,
        validate: (d, bep) => {
          const err = validateTokenValue('discipline', d.id, bep.deliverableNamingConvention)
          return err ? [err] : []
        },
      },
    )
  }
}
