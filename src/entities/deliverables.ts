import type { BEP, Deliverable, Discipline, Extension } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { DeliverableSchema } from '../types/schema.js'
import type { DeliverableResolved, AssetTypeResolved, LBSNodeResolved, TeamResolved } from '../types/resolved.js'
import { buildCodeMap } from '../utils/nomenclature.js'
import type { AssetTypes } from './assetTypes.js'
import type { LBSNodes } from './lbsNodes.js'
import type { Milestones } from './milestones.js'
import type { Teams } from './teams.js'

export class Deliverables extends Entity<Deliverable, true> {
  constructor(
    getBep: () => BEP,
    private readonly getTeams: () => Teams,
    private readonly getAssetTypes: () => AssetTypes,
    private readonly getLBSNodes: () => LBSNodes,
    private readonly getMilestones: () => Milestones,
  ) {
    super(
      () => getBep().deliverables,
      getBep,
      {
        key: 'deliverables',
        schema: DeliverableSchema,
        autoId: true,
      },
    )
  }

  listResolved(): DeliverableResolved[] {
    const bep = this.getBep()
    const codeMap      = buildCodeMap(bep.deliverables, bep.project.code, bep.lbs)
    const teamMap      = new Map(this.getTeams().listResolved().map(t => [t.id, t]))
    const assetTypeMap = new Map(this.getAssetTypes().listResolved().map(dt => [dt.id, dt]))
    const lbsNodeMap   = new Map(this.getLBSNodes().listResolved().map(n => [n.id, n]))
    const milestoneMap = new Map(this.getMilestones().listResolved().map(m => [m.id, m]))

    // First pass: resolve everything except predecessor
    const partials = new Map<string, DeliverableResolved>()
    for (const d of bep.deliverables) {
      const milestone = milestoneMap.get(d.milestoneId) ?? null
      partials.set(d.id, {
        ...d,
        nomenclatureCode: codeMap.get(d.id) ?? '',
        effectiveDate: d.dueDate ?? milestone?.date ?? '',
        lbsNode:   d.lbsNodeId ? (lbsNodeMap.get(d.lbsNodeId) ?? null) : null as LBSNodeResolved | null,
        discipline: bep.disciplines.find(di => di.id === d.disciplineId) ?? null as Discipline | null,
        assetType:  assetTypeMap.get(d.assetTypeId) ?? null as AssetTypeResolved | null,
        extensions: (d.extensionIds ?? []).map(id => bep.extensions.find(e => e.id === id)).filter(Boolean) as Extension[],
        responsible: teamMap.get(d.responsibleId) ?? null as TeamResolved | null,
        milestone:   milestone,
        predecessor: null,
      })
    }

    // Second pass: resolve predecessors using the already-computed partials
    for (const d of bep.deliverables) {
      if (d.predecessorId) {
        const resolved = partials.get(d.id)!
        resolved.predecessor = partials.get(d.predecessorId) ?? null
      }
    }

    return [...partials.values()]
  }
}
