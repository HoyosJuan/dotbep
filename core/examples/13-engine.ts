// run: node --experimental-strip-types examples/13-engine.ts  (from core/)
//
// Covers: Engine, Runtime, workflow execution, type generation.
//
// bep.generateTypes() produces a TypeScript contract from the BEP's effects
// and automations. Writing it to bep.d.ts gives full type safety in the Runtime.
//
// Workflow (4 nodes):
//
//   start ──► review ──[submit / effect: notify-reviewer]──► auto-approve ──[approved]──► end

import { writeFileSync } from 'node:fs'
import * as BEP from '../dist/index.js'
import type { BepTypes } from './bep.js'

// ─── 1. Build the BEP ─────────────────────────────────────────────────────────

const bep = BEP.Bep.create({ name: 'Demo Project', code: 'DEMO', description: '' })

const [{ id: roleManagerId }]  = bep.roles.add([{ name: 'BIM Manager' }]).succeeded
bep.members.add([{ email: 'manager@demo.com', name: 'Ana García', roleId: roleManagerId }])
const [{ id: assetTypeId }]    = bep.assetTypes.add([{ id: 'MDL', name: 'Model' }]).succeeded
const [{ id: actionReviewId }] = bep.actions.add([{ name: 'Review model' }]).succeeded

bep.events.add([
  { id: 'submit',   name: 'Submit for review', payload: [{ key: 'comment', type: 'string', required: false }] },
  { id: 'approved', name: 'Approved' },
])
bep.effects.add([
  { id: 'notify-reviewer', name: 'Notify reviewer', payload: [{ key: 'comment', type: 'string', required: false }] },
])
bep.automations.add([
  { id: 'auto-approve', name: 'Auto approve', output: [] },
])

const [{ id: workflowId }] = bep.workflows.add([{
  name: 'Model Review',
  diagram: {
    direction: 'LR',
    nodes: {
      start:       { type: 'start' },
      review:      { type: 'process', actionId: actionReviewId, responsibleRoleIds: [roleManagerId] },
      autoApprove: { type: 'automation', automationId: 'auto-approve' },
      end:         { type: 'end' },
    },
    edges: {
      e1: { from: 'start',       to: 'review' },
      e2: { from: 'review',      to: 'autoApprove', triggerEventId: 'submit', effectIds: ['notify-reviewer'] },
      e3: { from: 'autoApprove', to: 'end',         triggerEventId: 'approved' },
    },
  },
}]).succeeded

// ─── 2. Generate types ────────────────────────────────────────────────────────
//
// bep.generateTypes() produces a TypeScript contract from the BEP's effects and
// automations. Commit bep.d.ts alongside your runtime so TypeScript can validate it.

writeFileSync('examples/bep.d.ts', bep.generateTypes())
console.log('Generated examples/bep.d.ts')

// ─── 3. Declare the BEP Runtime ───────────────────────────────────────────────
//
// BepTypes (from bep.d.ts) types each handler's payload automatically.

class MyRuntime extends BEP.Runtime<BepTypes> {
  constructor(options: BEP.RuntimeOptions) {
    super(options)
    this.effect('notify-reviewer', async (instance, payload) => {
      console.log('  [effect] notify-reviewer fired')
      console.log('  [effect] submitted by:', instance.history.at(-1)?.actor)
      console.log('  [effect] comment:', payload.comment)  // string | undefined ← inferred
    })
    this.automation('auto-approve', async (_instance, _payload) => {
      console.log('  [automation] auto-approve running')
      return { eventId: 'approved' }
    })
  }
}

// ─── 4. Init the engine and run ───────────────────────────────────────────────

bep.engine.init({ runtime: new MyRuntime({ env: {} }) })

console.log('\n=== create instance ===')
const instance = await bep.engine.createInstance(
  workflowId,
  { assetTypeId, id: 'model-001', label: 'Structural Model v3' },
  'manager@demo.com',
)
console.log('status:', instance!.status)
console.log('current node:', instance!.currentNodeId)

console.log('\n=== emit: submit ===')
const result = await bep.engine.emit(instance!.id, {
  eventId: 'submit',
  actor:   'manager@demo.com',
  payload: { comment: 'Ready for review' },
})
console.log('ok:', result.ok)
console.log('transitions:', result.transitionsApplied?.map(t => `${t.fromNodeId} → ${t.toNodeId}`))
console.log('effects:', result.effects?.map(e => `${e.effectId}: ${e.status}`))
console.log('final node:', result.instance?.currentNodeId)
console.log('final status:', result.instance?.status)
