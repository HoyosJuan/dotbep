// part of: node --experimental-strip-types examples/run-all.ts  (use --14 to stop here)
//
// Covers: reports.
//
// Reports are project snapshots authored in Markdown, stored outside bep.json.
// Metadata lives in reports/index.json; content at reports/{id}.md inside the zip.
// The author must be a Member email at creation time, but removing a member does
// not cascade — reports remain as a historical record.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Add ──────────────────────────────────────────────────────────────────────

const added = bep.reports.add([
  {
    name: 'Weekly Progress — W22',
    date: '2024-06-03',
    author: 'alice@arc.com',
    content: '# Weekly Progress W22\n\nAll clash detection tasks completed.',
  },
  {
    name: 'Monthly Summary — June',
    description: 'End-of-month consolidated report.',
    date: '2024-06-30',
    author: 'bob@arc.com',
    content: '# Monthly Summary June\n\nDeadlines met. No blockers.',
  },
  {
    name: 'Invalid Report',
    date: '2024-07-01',
    author: 'nobody@unknown.com', // fails — not a member
    content: 'Should not be added.',
  },
])
const weeklyId  = added.succeeded[0].id
const monthlyId = added.succeeded[1].id
console.log('add succeeded:', added.succeeded.map(r => r.name))
console.log('add failed:   ', added.failed.map(f => `${f.id}: ${f.error.slice(0, 50)}`))

// ─── List ─────────────────────────────────────────────────────────────────────

console.log('\nlist:', bep.reports.list().map(r => `${r.name} (${r.date})`))

// ─── Get ──────────────────────────────────────────────────────────────────────

const got = bep.reports.get([weeklyId, 'ghost-id'])
console.log('\nget succeeded:', got.succeeded.map(r => r.name))
console.log('get failed:   ', got.failed.map(f => f.error))

// ─── GetContent / SetContent ──────────────────────────────────────────────────

const content = await bep.reports.getContent(weeklyId)
console.log('\ngetContent (first 40 chars):', content.slice(0, 40))

bep.reports.setContent(weeklyId, '# Weekly Progress W22 (revised)\n\nUpdated after review.')
const updated = await bep.reports.getContent(weeklyId)
console.log('after setContent (first 40 chars):', updated.slice(0, 40))

// ─── Update ───────────────────────────────────────────────────────────────────

const patched = bep.reports.update([
  { id: weeklyId, name: 'Weekly Progress — W22 (final)' },
  { id: monthlyId, author: 'nobody@unknown.com' }, // fails — not a member
  { id: 'ghost-id', name: 'Ghost' },               // fails — not found
])
console.log('\nupdate succeeded:', patched.succeeded.map(r => r.name))
console.log('update failed:   ', patched.failed.map(f => `${f.id.slice(0, 8)}…: ${f.error.slice(0, 50)}`))

// ─── Remove ───────────────────────────────────────────────────────────────────

const removed = bep.reports.remove([monthlyId, 'ghost-id'])
console.log('\nremove succeeded:', removed.succeeded.map(id => id.slice(0, 8) + '…'))
console.log('remove failed:   ', removed.failed.map(f => f.error))
console.log('reports remaining:', bep.reports.list().map(r => r.name))

// ─── Consolidation ────────────────────────────────────────────────────────────
// Reports added since the last commit are pending: their IDs appear in
// reports/index.json but not in baseline/reports/index.json.
// commit({ type: 'collections' }) snapshots the collection baselines without
// creating a new plan version.

const statusBefore = await bep.history.status()
console.log('\npending reports before consolidation:', statusBefore.pendingCollections['reports']?.added ?? [])
// → [weeklyId] — monthlyId was removed so only the remaining one is pending

await bep.history.commit({ target: 'reports' })

const statusAfter = await bep.history.status()
console.log('pending reports after consolidation: ', statusAfter.pendingCollections['reports']?.added ?? [])
// → [] — all current reports are now in the baseline

// ─── Persist — round-trip through open() ──────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())

const bep2   = await Bep.open(readFileSync('examples/example.bep'))
const loaded = bep2.reports.list()
console.log('\nafter reload — reports:', loaded.map(r => r.name))
console.log('content after reload (first 35 chars):',
  (await bep2.reports.getContent(weeklyId)).slice(0, 35))

console.log('\nSaved → examples/example.bep')
