// part of: node --experimental-strip-types examples/run-all.ts  (use --08 to stop here)
//
// Covers: deliverables, nomenclature.
//
// Deliverables are the actual files that teams must produce and exchange.
// They are the most cross-referenced entity in the BEP — each one ties together
// a discipline, a document type, a set of extensions, a responsible team, a
// milestone, and optionally an LBS location and a predecessor deliverable.
//
// Nomenclature derives a human-readable naming code from those references:
//   {project.code}-{team.id}-{zoneCode}-{locationCode}-{assetType.id}-{disc.id}-{NNN}
// NNN is a global sequence counter across all deliverables, zero-padded to three digits.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep, buildCodeMap } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

const m1Id = bep.milestones.list().find(m => m.name === 'Design Delivery')!.id
const m2Id = bep.milestones.list().find(m => m.name === 'Construction Delivery')!.id

// ─── Deliverables ─────────────────────────────────────────────────────────────

// Every reference field is validated on add. A deliverable with a ghost
// disciplineId, assetTypeId, extensionId, responsibleId, milestoneId, or
// lbsNodeId fails individually — other deliverables in the same batch proceed.
// predecessorId is set via update() after both IDs are known.

console.log('=== deliverables ===')

const delAdded = bep.deliverables.add([
  {
    description:    'Architectural Model — Floor 1',
    disciplineId:   'ARQ',
    assetTypeId: 'M3D',
    extensionIds:   ['ifc', 'rvt'],
    responsibleId:  'ARC',
    milestoneId:    m1Id,
    lbsNodeId:      'P01',
  },
  {
    description:    'Architectural Model — Floor 2',
    disciplineId:   'ARQ',
    assetTypeId: 'M3D',
    extensionIds:   ['ifc', 'rvt'],
    responsibleId:  'ARC',
    milestoneId:    m1Id,
    lbsNodeId:      'P02',
  },
  {
    description:    'Structural Model — Floor 1',
    disciplineId:   'EST',
    assetTypeId: 'M3D',
    responsibleId:  'ARC',
    milestoneId:    m2Id,
    lbsNodeId:      'P01',
    // predecessorId set after d1 is known
  },
  // integrity failures —
  { description: 'Bad discipline', disciplineId: 'ghost-disc', assetTypeId: 'M3D',       responsibleId: 'ARC',        milestoneId: m1Id               },
  { description: 'Bad assetType', disciplineId: 'ARQ',        assetTypeId: 'ghost-dt',  responsibleId: 'ARC',        milestoneId: m1Id               },
  { description: 'Bad extension', disciplineId: 'ARQ',        assetTypeId: 'M3D',       extensionIds: ['ghost-ext'], responsibleId: 'ARC', milestoneId: m1Id },
  { description: 'Bad team',      disciplineId: 'ARQ',        assetTypeId: 'M3D',       responsibleId: 'ghost-team', milestoneId: m1Id               },
  { description: 'Bad milestone', disciplineId: 'ARQ',        assetTypeId: 'M3D',       responsibleId: 'ARC',        milestoneId: 'ghost-ms'         },
  { description: 'Bad lbsNode',   disciplineId: 'ARQ',        assetTypeId: 'M3D',       responsibleId: 'ARC',        milestoneId: m1Id, lbsNodeId: 'ghost-node' },
])
const d1 = delAdded.succeeded[0].id
const d2 = delAdded.succeeded[1].id
const d3 = delAdded.succeeded[2].id
console.log('add succeeded:', delAdded.succeeded.map(d => d.description))
console.log('add failed:   ', delAdded.failed)

// set predecessor now that both IDs are known
bep.deliverables.update([{ id: d3, predecessorId: d1 }])

console.log('\n--- integrity: predecessor blocks removal of the referenced deliverable ---')
const d1Blocked = bep.deliverables.remove([d1])
console.log('remove d1 (blocked by d3.predecessorId):', d1Blocked.failed)

console.log('\n--- integrity: entities referenced by deliverables cannot be removed ---')
console.log('remove ARQ (discipline):', bep.disciplines.remove(['ARQ']).failed)
console.log('remove M3D (assetType): ', bep.assetTypes.remove(['M3D']).failed)
console.log('remove m1  (milestone): ', bep.milestones.remove([m1Id]).failed)
console.log('remove ARC (team):      ', bep.teams.remove(['ARC']).failed)
console.log('remove P01 (lbsNode):   ', bep.lbsNodes.remove(['P01']).failed)

// ─── Nomenclature ─────────────────────────────────────────────────────────────

// buildCodeMap() computes naming codes for all deliverables in one pass.
// LBS resolution: P01 is a child of BLK → zoneCode=BLK, locationCode=P01.
//                 P02 is also a child of BLK → same zone, different location.
// NNN is a global zero-padded sequence, so d1→001, d2→002, d3→003.
//
// getCode() is a single-deliverable shortcut that internally calls buildCodeMap.
// buildConsecutivoMap() returns the raw integer sequence numbers before zero-padding.
// The standalone buildCodeMap import is useful when BEP data comes from outside
// the Bep class (e.g. from a raw JSON snapshot).
const codeMap = bep.nomenclature.buildCodeMap()
console.log('code map:')
for (const [id, code] of codeMap) {
  console.log(' ', id.slice(0, 8), '→', code)
}
// d1 → EXP-ARC-BLK-P01-M3D-ARQ-001
// d2 → EXP-ARC-BLK-P02-M3D-ARQ-001  (different location → new NNN sequence)
// d3 → EXP-ARC-BLK-P01-M3D-EST-001

// getCode: single deliverable by id
console.log('\nd1 code:', bep.nomenclature.getCode(d1))
console.log('d2 code:', bep.nomenclature.getCode(d2))
console.log('d3 code:', bep.nomenclature.getCode(d3))
console.log('ghost:  ', bep.nomenclature.getCode('ghost-id'))  // null

// buildConsecutivoMap: raw sequence numbers per deliverable (before zero-padding)
const seqMap = bep.nomenclature.buildConsecutivoMap()
console.log('seq d1:', seqMap.get(d1))  // 1
console.log('seq d2:', seqMap.get(d2))  // 1 (different location → independent sequence)
console.log('seq d3:', seqMap.get(d3))  // 1

// standalone buildCodeMap — useful when BEP data comes from an external source
const externalMap = buildCodeMap(bep.data.deliverables, bep.data.project.code, bep.data.lbs)
console.log('\nexternal buildCodeMap matches:', [...externalMap.values()].join(', '))

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
