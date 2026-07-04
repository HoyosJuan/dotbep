// part of: node --experimental-strip-types examples/run-all.ts  (use --07 to stop here)
//
// Covers: lods, lois, loin.
//
// The LOIN section defines the Level of Information Need — what must be known
// about each model element at each milestone. It is the core of an ISO 19650
// information requirements framework.
//
// LOD (Level of Development) — geometric completeness of a model element.
// LOI (Level of Information) — richness of the non-geometric data attached to it.
// LOIN — the per-element table that maps (element × milestone) → (LOD, LOI).
//
// LOD and LOI ids are numeric strings ('100', '200', …). They are readable
// codes, not UUIDs — the user chooses them to match the project's convention.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

const m1Id = bep.milestones.list().find(m => m.name === 'Design Delivery')!.id
const m2Id = bep.milestones.list().find(m => m.name === 'Construction Delivery')!.id

// ─── LODs ─────────────────────────────────────────────────────────────────────

// LOD levels are defined once and reused across all LOIN entries. Each level
// can carry a checklist that the frontend renders as acceptance criteria.
// The id is a string (not a number) so that it participates in the same
// get/update/remove API as all other entities.

console.log('=== lods ===')

const lodsAdded = bep.lods.add([
  { id: '100', name: 'LOD 100', checklist: ['Conceptual massing present'                          ] },
  { id: '200', name: 'LOD 200'                                                                      },
  { id: '300', name: 'LOD 300', checklist: ['All geometry defined', 'Dimensions accurate'         ] },
  { id: '350', name: 'LOD 350', checklist: ['Connections and interfaces defined'                   ] },
  { id: '100', name: 'Duplicate'                                                                   }, // fails
])
console.log('add succeeded:', lodsAdded.succeeded.map(l => l.id))
console.log('add failed:   ', lodsAdded.failed)

const gotLod = bep.lods.get(['100', '999'])
console.log('\nget 100:', gotLod.succeeded[0].name)
console.log('get 999 (failed):', gotLod.failed)

bep.lods.update([
  { id: '100', name: 'LOD 100 — Conceptual' },
  { id: '999', name: 'Ghost'                }, // fails
])

// ─── LOIs ─────────────────────────────────────────────────────────────────────

// LOI levels follow the same pattern as LODs — numeric string ids, optional
// checklists. LOI 1 might require only a classification code; LOI 3 might
// require a full property set with IFC links. The checklists make those
// expectations explicit and auditable.

console.log('\n=== lois ===')

const loisAdded = bep.lois.add([
  { id: '1', name: 'LOI 1'                                                                         },
  { id: '2', name: 'LOI 2', checklist: ['Classification assigned', 'Material specified'           ] },
  { id: '3', name: 'LOI 3', checklist: ['Full property set defined', 'IFC classification linked'  ] },
  { id: '1', name: 'Duplicate'                                                                     }, // fails
])
console.log('add succeeded:', loisAdded.succeeded.map(l => l.id))
console.log('add failed:   ', loisAdded.failed)

// ─── LOIN ─────────────────────────────────────────────────────────────────────

// A LOIN entry describes one model element type (e.g. "Walls") and its
// information requirements across milestones. Each entry maps a discipline to
// a list of (milestone → LOD + LOI) pairs.
//
// Every reference — discipline, milestone, LOD, LOI — is validated on add.
// A single bad reference fails the entire LOIN entry, not just that milestone.

console.log('\n=== loin ===')

const loinAdded = bep.loin.add([
  {
    element:      'Walls',
    disciplineId: 'ARQ',
    milestones: [
      { milestoneId: m1Id, lodId: '300', loiId: '2' },
      { milestoneId: m2Id, lodId: '350', loiId: '3' },
    ],
  },
  {
    element:      'Slabs',
    disciplineId: 'EST',
    milestones: [
      { milestoneId: m1Id, lodId: '200', loiId: '1' },
      { milestoneId: m2Id, lodId: '300', loiId: '2' },
    ],
  },
  // integrity failures —
  { element: 'Bad discipline', disciplineId: 'ghost-disc'                                                             }, // fails
  { element: 'Bad milestone',  disciplineId: 'ARQ', milestones: [{ milestoneId: 'ghost', lodId: '100', loiId: '1' }] }, // fails
  { element: 'Bad LOD',        disciplineId: 'ARQ', milestones: [{ milestoneId: m1Id,   lodId: '999', loiId: '1' }] }, // fails
  { element: 'Bad LOI',        disciplineId: 'ARQ', milestones: [{ milestoneId: m1Id,   lodId: '100', loiId: '99' }] }, // fails
])
const loinWallsId = loinAdded.succeeded[0].id
const loinSlabsId = loinAdded.succeeded[1].id
console.log('add succeeded:', loinAdded.succeeded.map(l => l.element))
console.log('add failed:   ', loinAdded.failed)

console.log('\n--- integrity: entities referenced by LOIN cannot be removed ---')
console.log('remove ARQ (discipline):', bep.disciplines.remove(['ARQ']).failed)
console.log('remove m1  (milestone): ', bep.milestones.remove([m1Id]).failed)
console.log('remove 300 (lod):       ', bep.lods.remove(['300']).failed)
console.log('remove LOI 2:           ', bep.lois.remove(['2']).failed)

// remove works when the LOIN entry itself is deleted first
const loinRemoved = bep.loin.remove([loinSlabsId, 'ghost-loin'])
console.log('\nremove Slabs LOIN succeeded:', loinRemoved.succeeded)
console.log('remove ghost failed:        ', loinRemoved.failed)

// re-add Slabs so the complete BEP carries it forward
bep.loin.add([{
  element:      'Slabs',
  disciplineId: 'EST',
  milestones: [
    { milestoneId: m1Id, lodId: '200', loiId: '1' },
    { milestoneId: m2Id, lodId: '300', loiId: '2' },
  ],
}])

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
