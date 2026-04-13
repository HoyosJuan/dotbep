import type { BEP, LOIN, LOINMilestone } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { LOINSchema } from '../types/schema.js'
import type { LOINResolved } from '../types/resolved.js'

export class LOINEntity extends Entity<LOIN, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().loin,
      getBep,
      {
        key: 'loin',
        schema: LOINSchema,
        autoId: true,
        validate: (item, bep) => {
          const errors: string[] = []
          for (const loinMilestone of item.milestones ?? []) {
            if (!bep.milestones.some(m => m.id === loinMilestone.milestoneId))
              errors.push(`milestones["${loinMilestone.milestoneId}"] not found`)
            if (!bep.lods.some(l => l.id === loinMilestone.lodId))
              errors.push(`lods[${loinMilestone.lodId}] not found`)
            if (!bep.lois.some(l => l.id === loinMilestone.loiId))
              errors.push(`lois[${loinMilestone.loiId}] not found`)
          }
          return errors
        },
      },
    )
  }

  addMilestones(items: { loinId: LOIN['id']; milestones: LOINMilestone[] }[]): {
    succeeded: { loinId: LOIN['id']; element: LOIN['element']; addedMilestones: LOINMilestone['milestoneId'][] }[]
    failed: { loinId: LOIN['id']; error: string }[]
  } {
    const succeeded: { loinId: LOIN['id']; element: LOIN['element']; addedMilestones: LOINMilestone['milestoneId'][] }[] = []
    const failed: { loinId: LOIN['id']; error: string }[] = []

    for (const item of items) {
      const loin = this.getBep().loin.find(l => l.id === item.loinId)
      if (!loin) { failed.push({ loinId: item.loinId, error: `Not found: ${item.loinId}` }); continue }

      const dup = item.milestones.find(m => (loin.milestones ?? []).some(lm => lm.milestoneId === m.milestoneId))
      if (dup) { failed.push({ loinId: item.loinId, error: `Milestone "${dup.milestoneId}" already exists. Use updateMilestones to modify it.` }); continue }

      const newMilestones = [...(loin.milestones ?? []), ...item.milestones]
      const result = this.update([{ id: item.loinId, milestones: newMilestones }])
      if (result.failed.length > 0) { failed.push({ loinId: item.loinId, error: result.failed[0].error }); continue }

      succeeded.push({ loinId: item.loinId, element: loin.element, addedMilestones: item.milestones.map(m => m.milestoneId) })
    }

    return { succeeded, failed }
  }

  updateMilestones(items: { loinId: LOIN['id']; milestones: (Partial<LOINMilestone> & { milestoneId: LOINMilestone['milestoneId'] })[] }[]): {
    succeeded: { loinId: LOIN['id']; element: LOIN['element']; milestones: { milestoneId: LOINMilestone['milestoneId']; before: Omit<LOINMilestone, 'milestoneId'>; after: Omit<LOINMilestone, 'milestoneId'> }[] }[]
    failed: { loinId: LOIN['id']; error: string }[]
  } {
    const succeeded: { loinId: LOIN['id']; element: LOIN['element']; milestones: { milestoneId: LOINMilestone['milestoneId']; before: Omit<LOINMilestone, 'milestoneId'>; after: Omit<LOINMilestone, 'milestoneId'> }[] }[] = []
    const failed: { loinId: LOIN['id']; error: string }[] = []

    for (const item of items) {
      const loin = this.getBep().loin.find(l => l.id === item.loinId)
      if (!loin) { failed.push({ loinId: item.loinId, error: `Not found: ${item.loinId}` }); continue }

      const missing = item.milestones.find(m => !(loin.milestones ?? []).some(lm => lm.milestoneId === m.milestoneId))
      if (missing) { failed.push({ loinId: item.loinId, error: `Milestone "${missing.milestoneId}" not found. Use addMilestones to create it.` }); continue }

      const befores = new Map(loin.milestones!.map(m => [m.milestoneId, { lodId: m.lodId, loiId: m.loiId, idsPath: m.idsPath }]))
      const newMilestones: LOINMilestone[] = (loin.milestones ?? []).map(lm => {
        const patch = item.milestones.find(m => m.milestoneId === lm.milestoneId)
        return patch ? { ...lm, ...patch } : lm
      })

      const result = this.update([{ id: item.loinId, milestones: newMilestones }])
      if (result.failed.length > 0) { failed.push({ loinId: item.loinId, error: result.failed[0].error }); continue }

      const updatedLoin = this.getBep().loin.find(l => l.id === item.loinId)!
      succeeded.push({
        loinId: item.loinId,
        element: loin.element,
        milestones: item.milestones.map(m => {
          const after = updatedLoin.milestones!.find(lm => lm.milestoneId === m.milestoneId)!
          const before = befores.get(m.milestoneId)!
          return { milestoneId: m.milestoneId, before, after: { lodId: after.lodId, loiId: after.loiId, idsPath: after.idsPath } }
        }),
      })
    }

    return { succeeded, failed }
  }

  removeMilestones(items: { loinId: LOIN['id']; milestoneIds: LOINMilestone['milestoneId'][] }[]): {
    succeeded: { loinId: LOIN['id']; element: LOIN['element']; removedMilestones: LOINMilestone['milestoneId'][] }[]
    failed: { loinId: LOIN['id']; error: string }[]
  } {
    const succeeded: { loinId: LOIN['id']; element: LOIN['element']; removedMilestones: LOINMilestone['milestoneId'][] }[] = []
    const failed: { loinId: LOIN['id']; error: string }[] = []

    for (const item of items) {
      const loin = this.getBep().loin.find(l => l.id === item.loinId)
      if (!loin) { failed.push({ loinId: item.loinId, error: `Not found: ${item.loinId}` }); continue }

      const missing = item.milestoneIds.filter(id => !(loin.milestones ?? []).some(m => m.milestoneId === id))
      if (missing.length > 0) { failed.push({ loinId: item.loinId, error: `Milestones not found in this LOIN: ${missing.join(', ')}` }); continue }

      loin.milestones = (loin.milestones ?? []).filter(m => !item.milestoneIds.includes(m.milestoneId))
      succeeded.push({ loinId: item.loinId, element: loin.element, removedMilestones: item.milestoneIds })
    }

    return { succeeded, failed }
  }

  listResolved(): LOINResolved[] {
    const bep = this.getBep()
    return bep.loin.map(l => ({
      ...l,
      discipline: bep.disciplines.find(d => d.id === l.disciplineId) ?? null,
      milestones: (l.milestones ?? []).map(lm => ({
        ...lm,
        milestone: bep.milestones.find(m => m.id === lm.milestoneId) ?? null,
        lod: bep.lods.find(ld => ld.id === lm.lodId) ?? null,
        loi: bep.lois.find(li => li.id === lm.loiId) ?? null,
      })),
    }))
  }
}
