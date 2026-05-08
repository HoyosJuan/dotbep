// run: node --experimental-strip-types examples/13-engine.ts  (from core/)
//
// Covers: Engine, Runtime, workflow execution, type generation,
//         getRemoteData, useAdapter.
//
// bep.generateRuntimeTypes() produces a TypeScript contract from the BEP's runtime handlers — with JSDoc from each description field.
// Writing it to bep.d.ts gives full type safety in the Runtime development.
//
// Workflow (3 nodes):
//
//   start ──► review ──[submit / effect: notify-reviewer]──► end

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
  {
    id: 'notify-reviewer', name: 'Notify reviewer',
    description: 'Sends a notification to the assigned reviewer when a model is submitted. Uses the comment from the submit event payload.',
    payload: [{ key: 'comment', type: 'string', required: false }],
  },
])
bep.automations.add([
  {
    id: 'auto-approve', name: 'Auto approve',
    description: 'Automatically approves the model if no blocking issues are found in the previous review cycle.',
    payload: [{ key: 'threshold', type: 'number', required: true }],
    output: [{ key: 'result', type: 'string', required: true }],
  },
])
bep.resolvers.add([
  {
    id: 'fetch-json', name: 'Fetch JSON',
    description: 'Fetches a JSON array from the remote data URL. Authenticates with an API key via Authorization header. Returns the raw parsed array.',
    envKeys: ['API_KEY'],
  },
])
bep.adapters.add([
  {
    id: 'pick-label-value', name: 'Pick label + value',
    description: 'Maps an array of { name, count } objects to { label, value } pairs compatible with dotbep:pie-chart.',
  },
])
bep.remoteData.add([
  {
    name: 'Model stats', url: 'https://example.com/stats.json',
    description: 'Aggregated model statistics exported nightly from the project management tool.',
    resolverId: 'fetch-json',
  },
])

const [{ id: workflowId }] = bep.workflows.add([{
  name: 'Model Review',
  diagram: {
    direction: 'LR',
    nodes: {
      start:  { type: 'start' },
      review: { type: 'process', actionId: actionReviewId, responsibleRoleIds: [roleManagerId] },
      end:    { type: 'end' },
    },
    edges: {
      e1: { from: 'start',  to: 'review' },
      e2: { from: 'review', to: 'end', triggerEventId: 'submit', effectIds: ['notify-reviewer'] },
    },
  },
}]).succeeded

// ─── 2. Generate types ────────────────────────────────────────────────────────
//
// bep.generateRuntimeTypes() produces a TypeScript contract from the BEP's effects and
// automations. Commit bep.d.ts alongside your runtime so TypeScript can validate it.

writeFileSync('examples/bep.d.ts', bep.generateRuntimeTypes())
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
    this.automation('auto-approve', async (_instance, payload) => {
      console.log('  [automation] auto-approve running, threshold:', payload.threshold)
      return { eventId: 'approved', result: 'passed' }
    })
    this.resolver('fetch-json', async (url, env) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.API_KEY}` } })
      return res.json()
    })
    this.adapter('pick-label-value', (data) => {
      return (data as { name: string; count: number }[]).map(d => ({ label: d.name, value: d.count }))
    })
  }
}

// ─── 4. Init the engine and run ───────────────────────────────────────────────

bep.engine.init({ runtime: new MyRuntime({ env: {} }) })

console.log('\n=== create instance ===')
const instance = await bep.engine.createInstance(
  workflowId,
  { assetTypeId, id: 'model-001', label: 'Structural Model v3', source: 'bep:deliverables' },
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

console.log('\n=== getRemoteData + useAdapter ===')
// Uses a mock resolver so the demo works without a real endpoint.
const remoteDataId = bep.data.remoteData[0]!.id
try {
  const raw     = await bep.engine.getRemoteData(remoteDataId)
  const adapted = bep.engine.useAdapter('pick-label-value', raw)
  console.log('raw data:', raw)
  console.log('adapted:', adapted)
} catch (err) {
  // example.com/stats.json returns HTML — expected in this demo.
  console.log('(resolver error, expected with placeholder URL):', (err as Error).message)
}
