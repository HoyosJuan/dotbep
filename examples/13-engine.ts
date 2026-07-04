// run: node --experimental-strip-types examples/13-engine.ts  (from core/)
//
// Covers: Engine, Runtime, workflow execution, type generation, getRemoteData.
//
// bep.generateRuntimeTypes() produces a TypeScript contract from the BEP's runtime handlers — with JSDoc from each description field.
// Writing it to bep.d.ts gives full type safety in the Runtime development.
//
// Workflow (3 nodes):
//
//   start ──► review ──[submit / effect: notify-reviewer]──► end

import { writeFileSync, readFileSync } from 'node:fs'
import * as BEP from '../dist/index.js'
import type { BepTypes } from './bep.js'

// ─── JSON-backed instance store ───────────────────────────────────────────────

const INSTANCES_PATH = 'examples/instances.json'

writeFileSync(INSTANCES_PATH, '{}', 'utf8')

class JsonStorage implements BEP.InstanceStore {
  private _read(): Record<string, BEP.WorkflowInstance> {
    return JSON.parse(readFileSync(INSTANCES_PATH, 'utf8'))
  }
  private _write(data: Record<string, BEP.WorkflowInstance>): void {
    writeFileSync(INSTANCES_PATH, JSON.stringify(data, null, 2), 'utf8')
  }
  async listInstances(): Promise<BEP.WorkflowInstance[]> {
    return Object.values(this._read())
  }
  async getInstance(id: string): Promise<BEP.WorkflowInstance | null> {
    return this._read()[id] ?? null
  }
  async saveInstance(instance: BEP.WorkflowInstance): Promise<void> {
    const data = this._read()
    data[instance.id] = instance
    this._write(data)
  }
  async deleteInstance(id: string): Promise<void> {
    const data = this._read()
    delete data[id]
    this._write(data)
  }
}

// ─── 1. Build the BEP ─────────────────────────────────────────────────────────

const bep = BEP.Bep.create({ name: 'Demo Project', code: 'DEMO', description: '' })

const [{ id: roleManagerId }]   = bep.roles.add([{ name: 'BIM Manager' }]).succeeded
bep.members.add([{ email: 'manager@demo.com', name: 'Ana García', roleId: roleManagerId }])
bep.assetTypes.add([{ id: 'MDL', name: 'Model' }])
const [{ id: actionReviewId }]  = bep.actions.add([{ name: 'Review model' }]).succeeded
const [{ id: phaseId }]         = bep.phases.add([{ name: 'Design' }]).succeeded
const [{ id: milestoneId }]     = bep.milestones.add([{ name: 'M1', date: '2025-06-01', phaseId }]).succeeded
const [{ id: disciplineId }]    = bep.disciplines.add([{ id: 'ARC', name: 'Architecture' }]).succeeded
const [{ id: teamId }]          = bep.teams.add([{ id: 'DSN', name: 'Design Team', isoRole: 'appointed-party', memberEmails: ['manager@demo.com'] }]).succeeded
const [{ id: deliverableId }]   = bep.deliverables.add([{
  disciplineId,
  assetTypeId:   'MDL',
  responsibleId: teamId,
  milestoneId,
}]).succeeded

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
bep.env.add([
  {
    key: 'API_KEY',
    description: 'Bearer token for the project management API. Obtain it from the API settings page of the platform.',
  },
])
bep.resolvers.add([
  {
    id: 'fetch-json', name: 'Fetch JSON',
    description: 'Fetches a JSON array from the remote data URL. Authenticates with an API key via Authorization header. Returns the raw parsed array.',
    envKeys: ['API_KEY'],
  },
])
bep.remoteData.add([
  {
    name: 'Model stats', url: 'https://example.com/stats.json',
    description: 'Aggregated model statistics exported nightly from the project management tool.',
    resolverId: 'fetch-json',
  },
])

bep.softwares.add([{ id: 'notion', name: 'Notion', version: '1.0' }])

const [{ id: workflowId }] = bep.workflows.add([{
  name: 'Model Review',
  description: 'Tracks the review and approval cycle for a BIM model submitted by the team.',
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
// bep.generateRuntimeTypes() produces a TypeScript contract from the BEP's runtime.
// Commit bep.d.ts alongside your runtime so TypeScript can validate it.

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
      const last = instance.history.at(-1)
      console.log('  [effect] submitted by:', last?.type === 'transition' ? last.actor : undefined)
      console.log('  [effect] comment:', payload.comment)  // string | undefined ← inferred
    })
    this.automation('auto-approve', async (_instance, payload) => {
      console.log('  [automation] auto-approve running, threshold:', payload.threshold)
      return { success: true, eventId: 'approved', result: 'passed' }
    })
    this.resolver('fetch-json', async (url, env) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.API_KEY}` } })
      return res.json()
    })
    this.trigger('notion', async (rawPayload) => {
      const p = rawPayload as Record<string, unknown>
      const pageId = p['pageId'] as string ?? crypto.randomUUID()
      return {
        trackedAsset: {
          source: 'external' as const,
          url:    `https://notion.so/${pageId}`,
          label:  p['title'] as string ?? 'Untitled',
        },
        workflowId,
      }
    })
  }
}

// ─── 4. Init the engine and run ───────────────────────────────────────────────

bep.engine.init({ runtime: new MyRuntime({ env: {API_KEY: "value"} }), storage: new JsonStorage() })

console.log('\n=== create instance ===')
const instance = await bep.engine.workflows.create(
  workflowId,
  { source: 'internal' as const, type: 'deliverable' as const, id: deliverableId },
  'manager@demo.com',
)
console.log('status:', instance!.status)
console.log('current node:', instance!.currentNodeId)

console.log('\n=== workflows.getStatus() — awaiting the reviewer ===')
// A discriminated union — narrow on `.type` to see what's actually relevant right now.
const beforeSubmit = await bep.engine.workflows.getStatus(instance!.id)
console.log('type:', beforeSubmit?.type)
if (beforeSubmit?.type === 'awaitingAction') {
  console.log('transitions:', beforeSubmit.transitions.map(t => t.emits))
  console.log('responsible roleIds:', beforeSubmit.raci.responsible.roleIds)
}

console.log('\n=== emit: submit ===')
const result = await bep.engine.workflows.emit(instance!.id, {
  eventId: 'submit',
  actor:   'manager@demo.com',
  payload: { comment: 'Ready for review' },
})
console.log('success:', result.success)
console.log('transitions:', result.transitionsApplied?.map(t => `${t.fromNodeId} → ${t.toNodeId}`))
console.log('effects:', result.effects?.map(e => `${e.effectId}: ${e.success ? 'executed' : `failed (${e.error})`}`))
console.log('final node:', result.instance?.currentNodeId)
console.log('final status:', result.instance?.status)

const afterSubmit = await bep.engine.workflows.getStatus(instance!.id)
console.log('workflows.getStatus() type after submit:', afterSubmit?.type)

console.log('\n=== workflows.list() with a where query ===')
// Reuses the same field/operator/value vocabulary as EdgeGuard, evaluated against
// a per-instance projection that also resolves RACI/workflow context from the BEP.
const completed = await bep.engine.workflows.list({
  where: [{ field: 'status', operator: 'eq', value: 'completed' }],
})
console.log('completed instances:', completed.map(i => i.id))

console.log('\n=== create instance via trigger ===')
const triggerInstance = await bep.engine.workflows.create(
  'notion',
  { rawPayload: { pageId: 'page-abc123', title: 'Foundation Rebar Model' } },
  'dotBEP',
)
console.log('status:       ', triggerInstance!.status)
console.log('workflowId:   ', triggerInstance!.workflowId)
console.log('trackedAsset: ', triggerInstance!.trackedAsset)

console.log('\n=== getRemoteData ===')
const remoteDataId = bep.data.remoteData[0]!.id
try {
  const raw = await bep.engine.getRemoteData(remoteDataId)
  console.log('raw data:', raw)
} catch (err) {
  // example.com/stats.json returns HTML — expected in this demo.
  console.log('(resolver error, expected with placeholder URL):', (err as Error).message)
}
