// part of: node --experimental-strip-types examples/run-all.ts  (use --12 to stop here)
//
// Covers: history — commit, status, hasPendingChanges, discard, compare,
//         get, getStandardContent, revert, reset, squash.
//
// The history system versions the BEP using inverse RFC 6902 diffs. Each
// commit stores how to go back to the previous version, so the current state
// is always bep.json and older states are reconstructed on demand.
//
// Version numbers follow a {major}.{minor} scheme:
//   patch commit  → bumps minor  (0.0 → 0.1 → 0.2)
//   version commit → bumps major (0.x → 1.0), requires approvedBy[]
//
// Bep.open() auto-normalizes a BEP with no history by silently creating a v0.0
// baseline from the current state. The first manual commit therefore lands at
// v0.1, not v0.0. This example operates in memory only — it does not write back
// to example.bep, so the history modifications are discarded after the run.
//
// Standards (.md files) are versioned separately from bep.json: the history
// system snapshots each .md file only when it changes between commits, and
// resolves the correct snapshot when getStandardContent(id, version) is called.

import { readFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

const stdNamingId = bep.standards.list().find(s => s.name === 'Naming Convention')!.id

// ─── v0.1: first manual commit ────────────────────────────────────────────────
//
// Bep.open() auto-normalizes a BEP without history by creating a v0.0 baseline
// from the current state. The first manual commit therefore lands at v0.1.

console.log('=== history ===')
console.log('\n--- commit v0.1 (initial) ---')

const v0 = await bep.history.commit({
  type:        'patch',
  author:      'alice@arc.com',
  description: 'Initial BEP draft — all sections complete',
})
console.log('committed:', v0.version)  // 0.1

// ─── v0.2: data changes + standard content update ─────────────────────────────

console.log('\n--- changes for v0.2 ---')

bep.roles.add([{ name: 'BIM Author', color: '#22CC88' }])
bep.standards.setContent(stdNamingId, '# Naming Convention v3\nRevised rules after client review.')

// status() reports what changed since the last commit
const st02 = await bep.history.status()
console.log('pending — standards:', st02.standards)
// → [{ status: 'content-modified', id: stdNamingId }]

const v1 = await bep.history.commit({
  type:        'patch',
  author:      'alice@arc.com',
  description: 'Add BIM Author role + revise naming standard',
})
console.log('committed:', v1.version)  // 0.2

// resolve standard content at specific historical versions
const namingAtV01 = await bep.history.getStandardContent(stdNamingId, '0.1')
const namingAtV02 = await bep.history.getStandardContent(stdNamingId, '0.2')
console.log('naming @ v0.1 (first 35):', namingAtV01?.slice(0, 35))
console.log('naming @ v0.2 (first 35):', namingAtV02?.slice(0, 35))

// ─── v1.0: official version with approvers ────────────────────────────────────

console.log('\n--- commit v1.0 (official version, requires approvedBy) ---')

bep.standards.setContent(stdNamingId, '# Naming Convention v4\nFinal approved version.')
bep.phases.add([{ name: 'Tender' }])

const v2 = await bep.history.commit({
  type:        'version',
  author:      'alice@arc.com',
  description: 'First official BEP release',
  approvedBy:  ['alice@arc.com'],
})
console.log('committed:', v2.version)  // 1.0

// ─── discard ──────────────────────────────────────────────────────────────────

console.log('\n--- discard uncommitted changes ---')

bep.phases.add([{ name: 'Temporary — will be discarded' }])
bep.standards.setContent(stdNamingId, '# WILL BE DISCARDED')

console.log('hasPendingChanges before discard:', await bep.history.hasPendingChanges())
await bep.history.discard()
console.log('hasPendingChanges after discard: ', await bep.history.hasPendingChanges())

const namingAfterDiscard = await bep.standards.getContent(stdNamingId)
console.log('naming std restored (first 35):', namingAfterDiscard.slice(0, 35))
// → v4 content (restored from baseline at v1.0)

// ─── list / get / compare ─────────────────────────────────────────────────────

console.log('\n--- list / get / compare ---')

const versions = await bep.history.list()
console.log('versions:', versions.map(v => v.version))  // ['0.1', '0.2', '1.0']

// get: reconstruct state at v0.1 — BIM Author role should not exist yet
const atV01 = await bep.history.get('0.1')
const bimAuthorInV01 = atV01.roles.find(r => r.name === 'BIM Author')
console.log('BIM Author in v0.1:', bimAuthorInV01 ?? 'not found (correct)')

// compare: RFC 6902 diff between two versions + standards diff
const { diff: ops, standards: stdDiff } = await bep.history.compare('0.1', '0.2')
console.log('ops v0.1→v0.2:', ops.length, 'operation(s)', ops.slice(0, 2).map(o => `${o.op} ${o.path}`))
console.log('std  diff:     ', stdDiff)

// ─── revert ───────────────────────────────────────────────────────────────────

console.log('\n--- revert to v0.0 (non-destructive — creates a new version) ---')

const v3 = await bep.history.revert('0.1', {
  type:        'patch',
  author:      'alice@arc.com',
  description: 'Revert to initial draft',
})
console.log('reverted as:', v3.version)  // 1.1

const bimAuthorAfterRevert = bep.roles.list().find(r => r.name === 'BIM Author')
console.log('BIM Author after revert:', bimAuthorAfterRevert ?? 'not found (correct)')
console.log('versions after revert:  ', (await bep.history.list()).map(v => v.version))
// → ['0.0', '0.1', '0.2', '1.0', '1.1']

// ─── reset ────────────────────────────────────────────────────────────────────

console.log('\n--- reset to v0.2 (destructive — deletes all versions after v0.2) ---')

console.log('versions before reset:', (await bep.history.list()).map(v => v.version))
await bep.history.reset('0.2')
console.log('versions after reset: ', (await bep.history.list()).map(v => v.version))
// → ['0.0', '0.1', '0.2']

// ─── squash ───────────────────────────────────────────────────────────────────

console.log('\n--- squash (destructive — collapses all history into one terminus) ---')

console.log('versions before squash:', (await bep.history.list()).map(v => v.version))

const squashed = await bep.history.squash({
  newBase:     '2.0',
  author:      'alice@arc.com',
  description: 'Clean start — squash all history into v2.0',
  approvedBy:  ['alice@arc.com'],
})
console.log('squash result:', squashed.version)
console.log('versions after squash:', (await bep.history.list()).map(v => v.version))
// → ['2.0']

// getStandardContent still works from the new terminus
const namingAt20 = await bep.history.getStandardContent(stdNamingId, '2.0')
console.log('\nnaming std @ 2.0 (first 35):', namingAt20?.slice(0, 35))

// get() terminus works
const atSquashed = await bep.history.get('2.0')
console.log('get 2.0 — project name:', atSquashed.project.name)

console.log('\nDone.')
