import type { BEP, LOD } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { LODSchema } from '../types/schema.js'

export class LODs extends Entity<LOD> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().lods,
      getBep,
      {
        key: 'lods',
        schema: LODSchema,
        beforeRemove: (id, bep) => {
          for (const loin of bep.loin) {
            const ref = loin.milestones?.find(m => m.lodId === id)
            if (ref) throw new Error(`Referenced by: loin["${loin.id}"].milestones[lodId=${id}]`)
          }
        },
      },
    )
  }
}
