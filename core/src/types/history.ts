import type { BEPVersion } from './schema.js'

export type SectionDiff = { added: string[]; removed: string[]; modified: string[] }

export type BepDiff = {
  /** Changed fields in bep.project, or null if the project object is unchanged. */
  project: { changed: true; fields: string[] } | null
  /** Per-entity diff (only entities with at least one change are included). */
  sections: Record<string, SectionDiff>
  /** Top-level keys that changed — 'project' + entity array keys with changes. */
  changedKeys: string[]
}

export type StandardChange = {
  id: string
  name: string
  status: 'added' | 'removed' | 'modified' | 'content-modified'
}

export type BepStatus = BepDiff & {
  hasPendingChanges: boolean
  standards: StandardChange[]
}

// Omit doesn't distribute over unions in TypeScript — DistributiveOmit does.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Input params for commit — computed fields (version, date, diff) are excluded. */
export type CommitParams = DistributiveOmit<BEPVersion, 'version' | 'date' | 'diff'>

export type SquashParams = {
  /** New terminus version — must be X.0 format and greater than current. */
  newBase: string
  author: string
  description: string
  approvedBy: string[]
}
