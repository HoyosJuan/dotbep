import type { BEP } from '../types/schema.js'

// ─── Types ────────────────────────────────────────────────────────────────────

// Extracts only the keys of T whose value type is an array.
// Uses the mapped-type `as` clause so the result is a plain string literal union without `never` or `undefined`.
export type ArrayKeys<T> = keyof { [K in keyof T as T[K] extends unknown[] ? K : never]: unknown }

export interface ReferenceRule {
  /** Array whose entities hold the reference */
  entity: ArrayKeys<BEP>
  /** Array being referenced */
  references: ArrayKeys<BEP>
  /** Field on the entity that holds the reference */
  inField: string
  /** True if `inField` is string[] instead of string. Default: false */
  array?: boolean
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export const refs: ReferenceRule[] = [
  // roles
  ({ entity: 'members',      references: 'roles',           inField: 'roleId'            }),
  // members
  ({ entity: 'teams',        references: 'members',         inField: 'representativeEmail' }),
  ({ entity: 'teams',        references: 'members',         inField: 'memberEmails',     array: true }),
  ({ entity: 'notes',        references: 'members',         inField: 'memberEmail'       }),
  // disciplines
  ({ entity: 'teams',        references: 'disciplines',     inField: 'disciplineIds',    array: true }),
  ({ entity: 'loin',         references: 'disciplines',     inField: 'disciplineId'      }),
  // extensions
  ({ entity: 'assetTypes',   references: 'extensions',      inField: 'extensionIds',     array: true }),
  // assetTypes
  ({ entity: 'softwares',    references: 'assetTypes',      inField: 'assetTypeIds',     array: true }),
  // annexes
  ({ entity: 'guides',       references: 'annexes',         inField: 'annexIds',         array: true }),
  // guides
  ({ entity: 'actions',      references: 'guides',          inField: 'guideIds',         array: true }),
  // softwares
  ({ entity: 'actions',      references: 'softwares',       inField: 'softwareIds',      array: true }),
  // objectives
  ({ entity: 'bimUses',      references: 'objectives',      inField: 'objectiveIds',     array: true }),
  // workflows
  ({ entity: 'bimUses',      references: 'workflows',       inField: 'workflowIds',      array: true }),
  // phases
  ({ entity: 'milestones',   references: 'phases',          inField: 'phaseId'           }),
  ({ entity: 'bimUses',      references: 'milestones',      inField: 'milestoneIds',     array: true }),
  // milestones
  ({ entity: 'deliverables', references: 'milestones',      inField: 'milestoneId'       }),
  // teams
  ({ entity: 'deliverables', references: 'teams',           inField: 'responsibleId'     }),
  // deliverables
  ({ entity: 'deliverables', references: 'disciplines',     inField: 'disciplineId'      }),
  ({ entity: 'deliverables', references: 'assetTypes',      inField: 'assetTypeId'       }),
  ({ entity: 'deliverables', references: 'extensions',      inField: 'extensionIds',     array: true }),
  ({ entity: 'deliverables', references: 'lbs',             inField: 'lbsNodeId'         }),
  ({ entity: 'deliverables', references: 'deliverables',    inField: 'predecessorId'     }),
  // lbs (self-referential)
  ({ entity: 'lbs',          references: 'lbs',             inField: 'lbsNodeIds',       array: true }),
]

// ─── Checkers ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable list of active references to the given entity id.
 * Empty array means it is safe to delete.
 */
export function checkRefs(id: string, references: ArrayKeys<BEP>, bep: BEP): string[] {
  return refs
    .filter(r => r.references === references)
    .flatMap(r => {
      const items = bep[r.entity] as unknown as Record<string, unknown>[]
      return items
        .filter(item => {
          const val = item[r.inField as string]
          return r.array
            ? Array.isArray(val) && val.includes(id)
            : val === id
        })
        .map(item => {
          const itemId = (item.id ?? item.email ?? '?') as string
          return `${String(r.entity)}["${itemId}"].${String(r.inField)}`
        })
    })
}

/**
 * Validates outgoing references in a set of fields (full entity on add, patch on update).
 * Returns a human-readable list of broken references. Empty array means all refs are valid.
 */
export function checkOutgoingRefs(
  fields: Record<string, unknown>,
  entity: ArrayKeys<BEP>,
  bep: BEP,
): string[] {
  return refs
    .filter(r => r.entity === entity)
    .flatMap(r => {
      const val = fields[r.inField as string]
      if (val === undefined || val === null || val === '') return []
      const ids = r.array ? (val as string[]) : [val as string]
      const targets = bep[r.references] as { id?: string; email?: string }[]
      return ids
        .filter(id => !targets.some(t => (t.id ?? t.email) === id))
        .map(id => `${String(r.references)}["${id}"] not found`)
    })
}
