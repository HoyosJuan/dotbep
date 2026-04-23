import type { BEP, BIMUse, Milestone, Objective } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { BIMUseSchema } from '../types/schema.js'
import type { BIMUseResolved, MilestoneResolved, WorkflowResolved } from '../types/resolved.js'
import type { Workflows } from './workflows.js'

export class BIMUses extends Entity<BIMUse, true> {
  constructor(getBep: () => BEP, private readonly getWorkflows: () => Workflows) {
    super(
      () => getBep().bimUses,
      getBep,
      {
        key: 'bimUses',
        schema: BIMUseSchema,
        autoId: true,
        validate: (item, bep) => {
          const errors: string[] = []
          for (const id of item.objectiveIds ?? []) {
            if (!bep.objectives.some(o => o.id === id))
              errors.push(`objectives["${id}"] not found`)
          }
          for (const id of item.milestoneIds ?? []) {
            if (!bep.milestones.some(m => m.id === id))
              errors.push(`milestones["${id}"] not found`)
          }
          for (const id of item.workflowIds ?? []) {
            if (!bep.workflows.some(w => w.id === id))
              errors.push(`workflows["${id}"] not found`)
          }
          return errors
        },
      },
    )
  }

  listResolved(): BIMUseResolved[] {
    const bep = this.getBep()
    const workflowMap = new Map(this.getWorkflows().listResolved().map(w => [w.id, w]))
    return bep.bimUses.map(bu => ({
      ...bu,
      objectives: (bu.objectiveIds ?? []).map(id => bep.objectives.find(o => o.id === id)).filter(Boolean) as Objective[],
      milestones: (bu.milestoneIds ?? []).map(id => {
        const m = bep.milestones.find(m => m.id === id)
        if (!m) return null
        return { ...m, phase: bep.phases.find(p => p.id === m.phaseId) ?? null } satisfies MilestoneResolved
      }).filter(Boolean) as MilestoneResolved[],
      workflows: (bu.workflowIds ?? []).map(id => workflowMap.get(id)).filter(Boolean) as WorkflowResolved[],
    }))
  }
}
