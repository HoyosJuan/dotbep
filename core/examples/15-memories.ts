// part of: node --experimental-strip-types examples/run-all.ts  (use --15 to stop here)
//
// Covers: memories — add, get, list, getContent, setContent, update, remove,
//         and consolidation via history.commit({ target: 'memories' }).
//
// Memories are LLM-generated project records stored in memories/index.json +
// memories/{slug}.md inside the .bep archive. Two types:
//   realization — institutional conclusions, rarely change after creation
//   pattern     — recurring behaviours observed across workflow instances
//
// IDs are LLM-provided slugs, stable even when the display name changes.
// Memories are curated artifacts: they accumulate over time and are not versioned
// with the plan. Consolidation via commit({ type: 'collections' }) marks the
// current set as the committed baseline without bumping the plan version.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

console.log('=== memories ===')

// list — empty at start (no memories were added by prior examples)
console.log('memories on open:', bep.memories.list().length)

// ─── Add ──────────────────────────────────────────────────────────────────────

const memoriesAdded = bep.memories.add([
  {
    id:        'mep-coordinator-bottleneck',
    name:      'MEP coordination delays',
    type:      'pattern',
    links:     [],
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-01T09:00:00Z',
    data:      { confidence: 0.85, evidenceCount: 7 },
    content:   'MEP coordination consistently causes delays when the responsible coordinator is absent during clash detection windows.',
  },
  {
    id:        'lod-300-confirmed',
    name:      'LOD 300 confirmed by client',
    type:      'realization',
    links:     ['mep-coordinator-bottleneck'],
    createdAt: '2026-06-10T14:00:00Z',
    updatedAt: '2026-06-10T14:00:00Z',
    content:   'Client confirmed LOD 300 as the minimum acceptable level for structural deliverables on 2026-06-10.',
  },
])
console.log('\nadd succeeded:', memoriesAdded.succeeded.map(m => `[${m.type}] ${m.id}`))
console.log('add failures:', memoriesAdded.failed)

// ─── List / Get ───────────────────────────────────────────────────────────────

console.log('\nlist count:', bep.memories.list().length)

const fetched = bep.memories.get(['lod-300-confirmed', 'ghost-slug'])
console.log('get succeeded:', fetched.succeeded.map(m => m.name))
console.log('get failed:   ', fetched.failed.map(f => f.error))

// ─── GetContent / SetContent ──────────────────────────────────────────────────

const body = await bep.memories.getContent('mep-coordinator-bottleneck')
console.log('\ngetContent (first 60):', body.slice(0, 60))

bep.memories.setContent('mep-coordinator-bottleneck', body + '\n\nObserved in 7 of 12 resolved MEP clash instances.')
const updated = await bep.memories.getContent('mep-coordinator-bottleneck')
console.log('after setContent length:', updated.length)

// ─── Update ───────────────────────────────────────────────────────────────────

const updateResult = bep.memories.update([
  {
    id:        'mep-coordinator-bottleneck',
    name:      'MEP coordinator absence causes delays',
    updatedAt: '2026-06-20T10:00:00Z',
    data:      { confidence: 0.9, evidenceCount: 10 },
  },
  { id: 'ghost-slug', name: 'Ghost' },
])
console.log('\nupdate succeeded:', updateResult.succeeded.map(m => m.name))
console.log('update failed:   ', updateResult.failed.map(f => f.error))

// ─── Duplicate slug rejection ──────────────────────────────────────────────────

const dupResult = bep.memories.add([{
  id:        'lod-300-confirmed',
  name:      'Duplicate attempt',
  type:      'realization',
  links:     [],
  createdAt: '2026-06-25T00:00:00Z',
  updatedAt: '2026-06-25T00:00:00Z',
  content:   'Should not be added.',
}])
console.log('\nduplicate add failed (expected):', dupResult.failed[0]?.error.slice(0, 50))

// ─── Remove ───────────────────────────────────────────────────────────────────

const removeResult = bep.memories.remove(['mep-coordinator-bottleneck', 'ghost-slug'])
console.log('\nremove succeeded:', removeResult.succeeded)
console.log('remove failed:   ', removeResult.failed.map(f => f.error))
console.log('memories remaining:', bep.memories.list().map(m => m.id))

// ─── Consolidation ────────────────────────────────────────────────────────────
// lod-300-confirmed is pending: in memories/index.json but not in the baseline.
// commit({ type: 'collections' }) snapshots all collection baselines without
// creating a new plan version — plan version stays unchanged.

const versionBefore = await bep.history.current()
const statusBefore = await bep.history.status()
console.log('\nplan version (unchanged throughout):', versionBefore)
console.log('pending memories before consolidation:', statusBefore.pendingCollections['memories']?.added ?? [])
// → ['lod-300-confirmed']

await bep.history.commit({ target: 'memories' })

const statusAfter = await bep.history.status()
const versionAfter = await bep.history.current()
console.log('plan version after consolidation:    ', versionAfter)   // same — no bump
console.log('pending memories after consolidation:', statusAfter.pendingCollections['memories']?.added ?? [])
// → []

// ─── Persist — round-trip through open() ──────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())

const bep2 = await Bep.open(readFileSync('examples/example.bep'))
console.log('\nafter reload — memories:', bep2.memories.list().map(m => m.id))
const reloadedContent = await bep2.memories.getContent('lod-300-confirmed')
console.log('content after reload (first 40):', reloadedContent.slice(0, 40))

// baseline persisted — no pending after reload
const statusReloaded = await bep2.history.status()
console.log('pending after reload:', statusReloaded.pendingCollections['memories'] ?? [])
// → []

console.log('\nSaved → examples/example.bep')
