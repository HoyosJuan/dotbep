// part of: node --experimental-strip-types examples/run-all.ts  (use --02 to stop here)
//
// Covers: disciplines, extensions, assetTypes, softwares.
//
// These entities describe the file ecosystem of the project: what kinds of
// documents are produced, in which formats, with which tools, and under which
// discipline. They are referenced heavily by deliverables and LOIN entries.
//
// The dependency chain is:
//   Extension ← AssetType ← Software
//
// Disciplines are orthogonal to that chain — they classify the authoring
// responsibility (Architecture, Structure, MEP…) and appear in deliverable
// naming codes and LOIN entries.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Disciplines ──────────────────────────────────────────────────────────────

// Disciplines identify the engineering domain responsible for a set of
// deliverables. Their id is a short readable code (e.g. 'ARQ') that appears
// directly in naming codes — choose it to match the project convention.

console.log('=== disciplines ===')

bep.disciplines.add([
  { id: 'ARQ', name: 'Architecture' },
  { id: 'EST', name: 'Structure'    },
  { id: 'MEP', name: 'MEP'          },
  { id: 'ARQ', name: 'Duplicate'    },   // fails — duplicate id
])
console.log('list:', bep.disciplines.list().map(d => d.id))

// associate ARC with ARQ to set up an integrity constraint
bep.teams.update([{ id: 'ARC', disciplineIds: ['ARQ'] }])

console.log('\n--- integrity: discipline referenced by team.disciplineIds cannot be removed ---')
const discBlocked = bep.disciplines.remove(['ARQ'])
console.log('remove ARQ (blocked by ARC.disciplineIds):', discBlocked.failed)

// ─── Extensions ───────────────────────────────────────────────────────────────

// Extensions are the file formats produced by the project (ifc, rvt, pdf…).
// Their id is a lowercase file extension that appears in deliverable naming.
// They are the base of the file type chain: Extension ← AssetType ← Software.

console.log('\n=== extensions ===')

bep.extensions.add([
  { id: 'ifc', name: 'IFC'   },
  { id: 'rvt', name: 'Revit' },
  { id: 'pdf', name: 'PDF'   },
])
console.log('list:', bep.extensions.list().map(e => e.id))

// ─── AssetTypes ───────────────────────────────────────────────────────────────

// Asset types classify what a file represents (3D Model, Report, Drawing…).
// Each type declares which extensions it can be delivered in. A deliverable then
// references an asset type and optionally overrides the extension subset.

console.log('\n=== assetTypes ===')

bep.assetTypes.add([
  { id: 'M3D', name: '3D Model', extensionIds: ['ifc', 'rvt'] },
  { id: 'RPT', name: 'Report',   extensionIds: ['pdf']        },
  { id: 'BAD', name: 'Bad Ext',  extensionIds: ['ghost']      },   // fails — extension not found
])
console.log('list:', bep.assetTypes.list().map(d => d.id))

console.log('\n--- integrity: extension referenced by assetType cannot be removed ---')
const extBlocked = bep.extensions.remove(['ifc'])
console.log('remove ifc (blocked by M3D.extensionIds):', extBlocked.failed)

// ─── Softwares ────────────────────────────────────────────────────────────────

// Softwares are the authoring tools used on the project. Each one is linked to
// the asset types it can produce. BIM Uses reference softwares to specify
// which tools are required for a particular use case.

console.log('\n=== softwares ===')

bep.softwares.add([
  { id: 'RVT', name: 'Revit',   version: '2025', assetTypeIds: ['M3D'] },
  { id: 'ACR', name: 'Acrobat', version: '2024', assetTypeIds: ['RPT'] },
  { id: 'BAD', name: 'Bad',     version: '1.0',  assetTypeIds: ['ghost'] }, // fails — assetType not found
])
console.log('list:', bep.softwares.list().map(s => s.id))

console.log('\n--- integrity: assetType referenced by software cannot be removed ---')
const dtBlocked = bep.assetTypes.remove(['M3D'])
console.log('remove M3D (blocked by RVT.assetTypeIds):', dtBlocked.failed)

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
