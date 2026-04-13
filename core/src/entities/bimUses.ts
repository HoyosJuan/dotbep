import type { BEP, BIMUse, Milestone, Objective } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { BIMUseSchema } from '../types/schema.js'
import type { BIMUseResolved, MilestoneResolved, SoftwareResolved, WorkflowResolved } from '../types/resolved.js'
import type { Softwares } from './softwares.js'
import type { Workflows } from './workflows.js'

export class BIMUses extends Entity<BIMUse, true> {
  constructor(getBep: () => BEP, private readonly getSoftwares: () => Softwares, private readonly getWorkflows: () => Workflows) {
    super(
      () => getBep().bimUses,
      getBep,
      {
        key: 'bimUses',
        schema: BIMUseSchema,
        autoId: true,
        validate: (item, bep) => {
          if (!item.software?.ids.length) return []
          return item.software.ids
            .filter(id => !bep.softwares.some(s => s.id === id))
            .map(id => `softwares["${id}"] not found`)
        },
      },
    )
  }

  listResolved(): BIMUseResolved[] {
    const bep = this.getBep()
    const softwareMap  = new Map(this.getSoftwares().listResolved().map(s => [s.id, s]))
    const workflowMap  = new Map(this.getWorkflows().listResolved().map(w => [w.id, w]))
    return bep.bimUses.map(bu => ({
      ...bu,
      objectives: (bu.objectiveIds ?? []).map(id => bep.objectives.find(o => o.id === id)).filter(Boolean) as Objective[],
      software: bu.software
        ? {
            description: bu.software.description,
            softwares: bu.software.ids.map(id => softwareMap.get(id)).filter(Boolean) as SoftwareResolved[],
          }
        : undefined,
      milestones: (bu.milestoneIds ?? []).map(id => {
        const m = bep.milestones.find(m => m.id === id)
        if (!m) return null
        return { ...m, phase: bep.phases.find(p => p.id === m.phaseId) ?? null } satisfies MilestoneResolved
      }).filter(Boolean) as MilestoneResolved[],
      workflows: (bu.workflowIds ?? []).map(id => workflowMap.get(id)).filter(Boolean) as WorkflowResolved[],
    }))
  }
}
