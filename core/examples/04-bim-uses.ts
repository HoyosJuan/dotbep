// part of: node --experimental-strip-types examples/run-all.ts  (use --04 to stop here)
//
// Covers: objectives, bimUses.
//
// BIM Uses answer the question "why are we using BIM on this project?".
// Each use case ties together the project objectives it serves, the software
// required to execute it, the phases it applies to, and the workflows that
// describe how it is carried out in practice.
//
// Objectives are the measurable targets — they exist independently and can be
// referenced by multiple BIM Uses. BIM Uses are the bridge between the strategic
// layer (what we want to achieve) and the operational layer (how we do it).

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

const wfCoordId = bep.workflows.list().find(w => w.name === 'Model Coordination')!.id

// ─── Objectives ───────────────────────────────────────────────────────────────

// Objectives are pure text statements — measurable commitments the project makes
// about what BIM will deliver. They have no references of their own; other
// entities (BIM Uses) point to them.

console.log('=== objectives ===')

const objectivesAdded = bep.objectives.add([
  { description: 'Reduce coordination errors by 30%'       },
  { description: 'Achieve LOD 350 at construction phase'   },
  { description: 'Reduce RFI count by 25% vs last project' },
])
const obj1Id = objectivesAdded.succeeded[0].id
const obj2Id = objectivesAdded.succeeded[1].id
console.log('add succeeded:', objectivesAdded.succeeded.map(o => o.description))

bep.objectives.update([
  { id: obj1Id, description: 'Reduce coordination errors by 30% using Revit clash detection' },
  { id: 'ghost-obj', description: 'Ghost' },   // fails
])

// ─── BIM Uses ─────────────────────────────────────────────────────────────────

// A BIM Use is the operational unit of the plan. It connects:
//   - objectiveIds  → the measurable targets it contributes to
//   - software      → the tools required (with a free-text description + ids)
//   - workflowIds   → the process diagrams that define how it is executed
//
// All referenced IDs are validated on add. The software.ids field references
// the softwares added in example 02, so they must already exist.

console.log('\n=== bimUses ===')

const bimUsesAdded = bep.bimUses.add([
  {
    name:         'Model Coordination',
    objectiveIds: [obj1Id],
    workflowIds:  [wfCoordId],
    software:     { description: 'Clash detection platform', ids: ['RVT'] },
  },
  {
    name:         'Design Authoring',
    objectiveIds: [obj2Id],
    software:     { description: 'BIM authoring tool', ids: ['RVT'] },
  },
  // integrity failures —
  { name: 'Bad Objective', objectiveIds: ['ghost-obj']         }, // fails — objective not found
  { name: 'Bad Software',  software:     { ids: ['ghost-sw'] } }, // fails — software not found
  { name: 'Bad Workflow',  workflowIds:  ['ghost-wf']          }, // fails — workflow not found
])
const buCoordId = bimUsesAdded.succeeded[0].id
console.log('add succeeded:', bimUsesAdded.succeeded.map(b => b.name))
console.log('add failed:   ', bimUsesAdded.failed)

console.log('\n--- integrity: software referenced by bimUse cannot be removed ---')
const swBlocked = bep.softwares.remove(['RVT'])
console.log('remove RVT (blocked by bimUse.software.ids):', swBlocked.failed)

console.log('\n--- integrity: workflow referenced by bimUse cannot be removed ---')
const wfBlocked = bep.workflows.remove([wfCoordId])
console.log('remove workflow (blocked by bimUse.workflowIds):', wfBlocked.failed)

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
