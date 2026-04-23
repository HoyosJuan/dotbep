// part of: node --experimental-strip-types examples/run-all.ts  (use --03 to stop here)
//
// Covers: actions, annexes, guides, workflows.
//
// Workflows are the heart of the BEP's process section. They describe how
// information is produced and reviewed — who does what, in what order, and
// under which RACI responsibility.
//
// The supporting entities build up toward the workflow:
//   Action  — an atomic step (e.g. "Update model")
//   Annex   — an external resource (video, document) that explains how to do it
//   Guide   — a named collection of annexes, attached to a workflow as reference material
//   Workflow — the full process diagram: a FlowDiagram with nodes and edges
//
// The diagram is stored as structured JSON (FlowDiagram), not Mermaid.
// Mermaid is generated at runtime in the frontend via flowDiagramToMermaid().
// Nodes reference actions and assign RACI roles to the people responsible.
// Edges from process nodes must carry a triggerEventId — the event that causes
// the transition.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// UUIDs are not stable across runs — look them up by name each time.
const roleManagerId = bep.roles.list().find(r => r.name === 'BIM Manager')!.id

// ─── Actions ──────────────────────────────────────────────────────────────────

console.log('=== actions ===')

const actionsAdded = bep.actions.add([
  { name: 'Update model'                                    },
  { name: 'Register issues', description: 'Log in BCF'     },
  { name: 'Review model'                                    },
])
const actionUpdateId = actionsAdded.succeeded[0].id
const actionIssuesId = actionsAdded.succeeded[1].id
const actionReviewId = actionsAdded.succeeded[2].id
console.log('add succeeded:', actionsAdded.succeeded.map(a => a.name))

// ─── Events ───────────────────────────────────────────────────────────────────

bep.events.add([
  { id: 'done', name: 'Done' },
])

// ─── Annexes ──────────────────────────────────────────────────────────────────

console.log('\n=== annexes ===')

const annexesAdded = bep.annexes.add([
  { name: 'IFC Tutorial', type: 'video',    url: 'https://example.com/ifc' },
  { name: 'BIM Guide',    type: 'document', url: 'guides/bim-guide.pdf'    },
])
const anx1Id = annexesAdded.succeeded[0].id
const anx2Id = annexesAdded.succeeded[1].id
console.log('add succeeded:', annexesAdded.succeeded.map(a => a.name))

// ─── Guides ───────────────────────────────────────────────────────────────────

console.log('\n=== guides ===')

const guidesAdded = bep.guides.add([
  { name: 'IFC Export Guide',  annexIds: [anx1Id, anx2Id] },
  { name: 'Coordination Guide'                             },
  { name: 'Bad Annex Ref',     annexIds: ['ghost']        },   // fails — annex not found
])
console.log('add succeeded:', guidesAdded.succeeded.map(g => g.name))
console.log('add failed:   ', guidesAdded.failed)

console.log('\n--- integrity: annex referenced by guide cannot be removed ---')
const annexBlocked = bep.annexes.remove([anx1Id])
console.log('remove IFC Tutorial (blocked by guide.annexIds):', annexBlocked.failed)

// ─── Workflows ────────────────────────────────────────────────────────────────

// A workflow is a named process diagram stored as a FlowDiagram — a record of
// nodes and edges identified by stable string keys. Each node can be a start,
// end, process, or decision step. Process nodes reference an action and carry
// RACI role assignments (responsible, accountable, consulted, informed).
//
// Edges outgoing from process nodes must declare a triggerEventId — the event
// that causes the transition.
//
// All references inside the diagram — actionIds, roleIds, edge targets —
// are validated on add and on update. Any broken reference fails the whole item.

console.log('\n=== workflows ===')

const wfAdded = bep.workflows.add([
  {
    name:        'Model Coordination',
    description: 'Weekly model coordination workflow',
    diagram: {
      direction: 'LR',
      nodes: {
        start:  { type: 'start' },
        update: { type: 'process', actionId: actionUpdateId, responsibleRoleIds: [roleManagerId] },
        review: { type: 'process', actionId: actionReviewId, responsibleRoleIds: [roleManagerId], accountableRoleIds: [roleManagerId] },
        issues: { type: 'process', actionId: actionIssuesId, responsibleRoleIds: [roleManagerId], consultedRoleIds:   [roleManagerId] },
        end:    { type: 'end' },
      },
      edges: {
        e1: { from: 'start',  to: 'update' },
        e2: { from: 'update', to: 'review',  triggerEventId: 'done' },
        e3: { from: 'review', to: 'issues',  triggerEventId: 'done' },
        e4: { from: 'issues', to: 'end',     triggerEventId: 'done' },
      },
    },
  },
  // integrity failures on add —
  {
    name: 'Bad Action Ref',
    diagram: { direction: 'LR', nodes: { n1: { type: 'process', actionId: 'ghost-action' } }, edges: {} },
  },                                                           // fails — action not found
  {
    name: 'Bad Role Ref',
    diagram: { direction: 'LR', nodes: { n1: { type: 'process', responsibleRoleIds: ['GHOST'] } }, edges: {} },
  },                                                           // fails — role not found
  {
    name: 'Bad Edge Ref',
    diagram: { direction: 'LR', nodes: { n1: { type: 'start' } }, edges: { e1: { from: 'n1', to: 'ghost-node' } } },
  },                                                           // fails — edge target not found
])
const wfCoordId = wfAdded.succeeded[0].id
console.log('add succeeded:', wfAdded.succeeded.map(w => w.name))
console.log('add failed:   ', wfAdded.failed)

console.log('\n--- integrity: action referenced by workflow node cannot be removed ---')
const actionBlocked = bep.actions.remove([actionUpdateId])
console.log('remove "Update model" (blocked by workflow node):', actionBlocked.failed)

console.log('\n--- integrity: role referenced by workflow RACI cannot be removed ---')
const roleBlocked = bep.roles.remove([roleManagerId])
console.log('remove BIM Manager (blocked by workflow RACI):', roleBlocked.failed)

console.log('\n--- update: diagram refs are re-validated on patch ---')
const wfPatchFailed = bep.workflows.update([{
  id:      wfCoordId,
  diagram: { direction: 'LR', nodes: { n1: { type: 'process', actionId: 'ghost-action' } }, edges: {} },
}])
console.log('update with ghost actionId failed:', wfPatchFailed.failed)

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
