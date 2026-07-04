// part of: node --experimental-strip-types examples/run-all.ts  (use --06 to stop here)
//
// Covers: phases, milestones, lbsNodes.
//
// The schedule section defines when information must be delivered and where
// in the project's spatial breakdown each deliverable belongs.
//
// Phases are the major stages of the project (Design, Construction, Handover).
// Milestones are the information exchange events within those phases — each one
// has a concrete date and is the target that deliverables and LOIN entries
// are anchored to.
//
// The LBS (Location Breakdown Structure) is a spatial tree of zones and
// locations. Deliverable naming codes are derived from it: a deliverable on
// floor P01 (child of block BLK) gets zone=BLK, location=P01 in its code.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Phases ───────────────────────────────────────────────────────────────────

// Phases are the top-level time containers. They have no dates of their own;
// the dates belong to milestones. Phases exist to group milestones and to
// derive the phase label for each deliverable at render time.

console.log('=== phases ===')

const phasesAdded = bep.phases.add([
  { name: 'Design'       },
  { name: 'Construction' },
  { name: 'Handover'     },
])
const desId = phasesAdded.succeeded[0].id
const conId = phasesAdded.succeeded[1].id
const hanId = phasesAdded.succeeded[2].id
console.log('add succeeded:', phasesAdded.succeeded.map(p => p.name))

// ─── Milestones ───────────────────────────────────────────────────────────────

// Milestones are the information exchange events defined by ISO 19650 — the
// moments at which teams must deliver a specific set of files. Each milestone
// has a concrete date (ISO 8601) and belongs to a phase.
// Deliverables and LOIN entries reference milestones to declare when and at
// what level of development something must be ready.

console.log('\n=== milestones ===')

const milestonesAdded = bep.milestones.add([
  { name: 'Design Delivery',       date: '2026-06-30', phaseId: desId },
  { name: 'Construction Delivery', date: '2027-03-31', phaseId: conId },
  { name: 'Handover Package',      date: '2027-09-30', phaseId: hanId },
  { name: 'Ghost Phase',           date: '2026-12-31', phaseId: 'ghost-phase' }, // fails — phase not found
])
const m1Id = milestonesAdded.succeeded[0].id
const m2Id = milestonesAdded.succeeded[1].id
console.log('add succeeded:', milestonesAdded.succeeded.map(m => m.name))
console.log('add failed:   ', milestonesAdded.failed)

console.log('\n--- integrity: phase referenced by milestone cannot be removed ---')
const phaseBlocked = bep.phases.remove([desId])
console.log('remove Design (blocked by milestone.phaseId):', phaseBlocked.failed)

// ─── LBS Nodes ────────────────────────────────────────────────────────────────

// The LBS (Location Breakdown Structure) is a spatial tree used to locate
// deliverables within the project. Each node is either a zone (container) or a
// location (leaf). The id is the naming code that appears in deliverable names.
//
// Build the tree bottom-up — leaves first — so that child references resolve
// on add. The root is the last node added; it is identified by having no parent.
//
//   SIT (zone, root)
//   ├─ BLK (zone)
//   │  ├─ P01 (location)
//   │  └─ P02 (location)
//   └─ FAC (zone)

bep.lbsNodes.add([
  { id: 'P01', name: 'Floor 1', type: 'location' },
  { id: 'P02', name: 'Floor 2', type: 'location' },
  { id: 'FAC', name: 'Facade',  type: 'zone'     },
])
bep.lbsNodes.add([
  { id: 'BLK', name: 'Block A', type: 'zone', lbsNodeIds: ['P01', 'P02'] },
])
const lbsRoot = bep.lbsNodes.add([
  { id: 'SIT', name: 'Site', type: 'zone', lbsNodeIds: ['BLK', 'FAC'] },
])
console.log('add root:', lbsRoot.succeeded.map(n => n.id))
console.log('tree:    ', bep.lbsNodes.list().map(n => `${n.id}(${n.type})`))

// validateTree: whole-tree structural check (roots must be zones, no cycles)
console.log('\nvalidateTree (valid tree):', bep.lbsNodes.validateTree())  // []

// resolveCodes: returns { zoneCode, locationCode } for deliverable naming
console.log('\n--- resolveCodes ---')
console.log('absent:    ', bep.lbsNodes.resolveCodes(undefined))  // XXX/XXX — no LBS node provided
console.log('root SIT: ', bep.lbsNodes.resolveCodes('SIT'))     // ZZZ/ZZZ — root has no zone parent
console.log('zone BLK:', bep.lbsNodes.resolveCodes('BLK'))   // BLK/ZZZ
console.log('loc  P01:  ', bep.lbsNodes.resolveCodes('P01'))      // BLK/P01

// per-node validation errors caught on add
console.log('\n--- add validation errors ---')
const badRef = bep.lbsNodes.add([{ id: 'BAD', name: 'Bad', type: 'zone', lbsNodeIds: ['ghost'] }])
console.log('missing child ref:', badRef.failed)

const badChild = bep.lbsNodes.add([{ id: 'BAD2', name: 'Bad', type: 'location', lbsNodeIds: ['FAC'] }])
console.log('location with zone child:', badChild.failed)

// validateTree catches structural errors not checked per-node (e.g. orphan location as root)
bep.lbsNodes.add([{ id: 'ORPHAN', name: 'Orphan', type: 'location' }])
console.log('\nvalidateTree (orphan location as root):', bep.lbsNodes.validateTree())
bep.lbsNodes.remove(['ORPHAN'])

console.log('\n--- integrity: node referenced as child cannot be removed ---')
const nodeBlocked = bep.lbsNodes.remove(['BLK'])
console.log('remove BLK (blocked by SIT.lbsNodeIds):', nodeBlocked.failed)

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
