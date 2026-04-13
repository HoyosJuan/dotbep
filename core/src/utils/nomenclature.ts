import type { BEP, Deliverable, LBSNode, NamingConvention, Team } from '../types/schema.js'
import { resolveLBSCodes } from './lbs.js'

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Assigns a consecutive sequence number per originator team.
 * Returns a map of Deliverable.id → sequence number.
 */
export function buildConsecutivoMap(deliverables: Deliverable[]): Map<Deliverable['id'], number> {
  const map = new Map<Deliverable['id'], number>()
  const teamCounters = new Map<Team['id'], number>()
  for (const d of deliverables) {
    const next = (teamCounters.get(d.responsibleId) ?? 0) + 1
    teamCounters.set(d.responsibleId, next)
    map.set(d.id, next)
  }
  return map
}

const FALLBACK = 'XXX'

/**
 * Generates the nomenclature code for a single deliverable.
 * Uses the BEP naming convention when present; falls back to the default format:
 * {project.code}-{team.id}-{zoneCode}-{locationCode}-{assetType.id}-{discipline.id}-{NNN}
 */
export function getNomenCode(
  d: Deliverable,
  projectCode: string,
  consecutivoMap: Map<string, number>,
  lbs: LBSNode[],
  convention?: NamingConvention,
): string {
  const { zoneCode, locationCode } = resolveLBSCodes(d.lbsNodeId, lbs)

  if (!convention) {
    const seq = String(consecutivoMap.get(d.id) ?? 0).padStart(3, '0')
    return [projectCode, d.responsibleId, zoneCode, locationCode, d.assetTypeId, d.disciplineId, seq].join('-')
  }

  const parts = convention.segments.map(seg => {
    if (seg.type === 'sequence') {
      const padding = seg.padding ?? 3
      return String(consecutivoMap.get(d.id) ?? 0).padStart(padding, '0')
    }
    switch (seg.token) {
      case 'project':     return projectCode     || FALLBACK
      case 'team':        return d.responsibleId || FALLBACK
      case 'discipline':  return d.disciplineId  || FALLBACK
      case 'assetType':   return d.assetTypeId   || FALLBACK
      case 'lbsZone':     return zoneCode
      case 'lbsLocation': return locationCode
    }
  })

  return parts.join(convention.delimiter)
}

/**
 * Builds a complete map of Deliverable.id → nomenclature code for all deliverables.
 */
export function buildCodeMap(
  deliverables: Deliverable[],
  projectCode: string,
  lbs: LBSNode[],
  convention?: NamingConvention,
): Map<Deliverable['id'], string> {
  const consecutivoMap = buildConsecutivoMap(deliverables)
  return new Map(deliverables.map(d => [
    d.id,
    getNomenCode(d, projectCode, consecutivoMap, lbs, convention),
  ]))
}

// ─── Class ────────────────────────────────────────────────────────────────────

/**
 * Convenience namespace on a Bep instance.
 * All methods read directly from the live BEP state — no extra inputs needed.
 */
export class Nomenclature {
  constructor(private getBep: () => BEP) {}

  /** Maps every deliverable id to its sequence number within its originator team. */
  buildConsecutivoMap(): Map<string, number> {
    return buildConsecutivoMap(this.getBep().deliverables)
  }

  /**
   * Returns the nomenclature code for a single deliverable.
   * Returns null if the deliverable id is not found.
   */
  getCode(deliverableId: Deliverable['id']): string | null {
    const bep = this.getBep()
    const d = bep.deliverables.find(d => d.id === deliverableId)
    if (!d) return null
    const consecutivoMap = buildConsecutivoMap(bep.deliverables)
    return getNomenCode(d, bep.project.code, consecutivoMap, bep.lbs, bep.deliverableNamingConvention)
  }

  /** Builds the complete map of deliverable.id → nomenclature code. */
  buildCodeMap(): Map<string, string> {
    const bep = this.getBep()
    return buildCodeMap(bep.deliverables, bep.project.code, bep.lbs, bep.deliverableNamingConvention)
  }
}
