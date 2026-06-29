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

/** Pending state for a curated artifact collection relative to its baseline. */
export type CollectionPending = { added: string[]; removed: string[] }

export type BepStatus = BepDiff & {
  hasPendingChanges: boolean
  standards: StandardChange[]
  /** Collections with entries that differ from the baseline — only populated keys have pending changes. */
  pendingCollections: Record<string, CollectionPending>
}

// Omit doesn't distribute over unions in TypeScript — DistributiveOmit does.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type PlanCommitParams = DistributiveOmit<BEPVersion, 'version' | 'date' | 'diff'>

/** Input params for commit — target discriminates between plan versioning and collection consolidation. */
export type CommitParams =
  | ({ target: 'plan' } & PlanCommitParams)
  | { target: 'reports' }
  | { target: 'memories' }

/** Input params for discard — target selects what to restore to its last consolidated baseline. */
export type DiscardParams =
  | { target: 'plan' }
  | { target: 'reports' }
  | { target: 'memories' }

export type SquashParams = {
  /** New terminus version — must be X.0 format and greater than current. */
  newBase: string
  author: string
  description: string
  approvedBy: string[]
}
