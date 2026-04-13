import type { BEP, LOI } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { LOISchema } from '../types/schema.js'

export class LOIs extends Entity<LOI> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().lois,
      getBep,
      {
        key: 'lois',
        schema: LOISchema,
        beforeRemove: (id, bep) => {
          for (const loin of bep.loin) {
            const ref = loin.milestones?.find(m => m.loiId === id)
            if (ref) throw new Error(`Referenced by: loin["${loin.id}"].milestones[loiId=${id}]`)
          }
        },
      },
    )
  }
}
