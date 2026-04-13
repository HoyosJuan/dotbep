import type { BEP, Milestone } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { MilestoneSchema } from '../types/schema.js'
import type { MilestoneResolved } from '../types/resolved.js'

export class Milestones extends Entity<Milestone, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().milestones,
      getBep,
      {
        key: 'milestones',
        schema: MilestoneSchema,
        autoId: true,
        beforeRemove: (id, bep) => {
          for (const loin of bep.loin) {
            const ref = loin.milestones?.find(m => m.milestoneId === id)
            if (ref) throw new Error(`Referenced by: loin["${loin.id}"].milestones[milestoneId="${id}"]`)
          }
        },
      },
    )
  }

  listResolved(): MilestoneResolved[] {
    const bep = this.getBep()
    return bep.milestones.map(m => ({
      ...m,
      phase: bep.phases.find(p => p.id === m.phaseId) ?? null,
    }))
  }
}
