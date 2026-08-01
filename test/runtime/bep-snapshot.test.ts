import { describe, it, expect } from 'vitest'
import * as BEP from '../../src/index.js'
import { ACTOR, externalAsset } from '../helpers.js'

/**
 * Covers this.bep — see docs/adrs/runtime-readonly-bep-snapshot.md. The
 * property is injected by Engine.init() as a structuredClone() of the plan,
 * not a live reference — these tests exist specifically to pin that
 * distinction, since a live reference would pass every test that only
 * checks "the data is there" and only fail the mutation-isolation one.
 *
 * Handlers here are registered via `this.automation(...)` inside a Runtime
 * subclass constructor (arrow function, closing over `this`) rather than
 * passed as a standalone function — same reason RUNTIME.md requires that
 * pattern for `this.env`: Engine calls automation handlers as plain
 * `handler(instance, payload)`, with no `this` binding of its own.
 */

function buildDisciplineBep() {
  const bep = BEP.Bep.create({ name: 'Bep snapshot test', code: 'SNAP', description: '' })

  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: ACTOR, name: 'Tester', roleId }])
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded
  bep.disciplines.add([{ id: 'ARQ', name: 'Arquitectura' }])

  bep.events.add([{ id: 'go', name: 'Go' }, { id: 'done', name: 'Done' }])
  bep.automations.add([
    { id: 'read-bep', name: 'Read bep', description: 'Test automation — reads this.bep.', payload: [], output: [{ key: 'disciplineName', type: 'string', required: false }] },
  ])

  const [{ id: workflowId }] = bep.workflows.add([{
    name: 'Bep snapshot workflow',
    diagram: {
      direction: 'LR',
      nodes: {
        start:   { type: 'start' },
        resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
        auto:    { type: 'automation', automationId: 'read-bep' },
        end:     { type: 'end' },
      },
      edges: {
        e1: { from: 'start',   to: 'resolve' },
        e2: { from: 'resolve', to: 'auto', triggerEventId: 'go' },
        e3: { from: 'auto',    to: 'end',  triggerEventId: 'done' },
      },
    },
  }]).succeeded

  return { bep, workflowId }
}

/** Records whatever this.bep.disciplines looks like when the automation runs, and optionally mutates it first. */
class BepReaderRuntime extends BEP.Runtime {
  seenDisciplineNames: string[] = []

  constructor(opts: { mutate?: boolean } = {}) {
    super({})
    this.automation('read-bep', async () => {
      if (opts.mutate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(this.bep.disciplines as any[]).push({ id: 'FAKE', name: 'Injected' })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(this.bep.disciplines[0] as any).name = 'Mutated'
      }
      this.seenDisciplineNames = this.bep.disciplines.map(d => d.name)
      return { success: true, eventId: 'done', disciplineName: this.seenDisciplineNames[0] }
    })
  }
}

describe('this.bep', () => {
  it('lets an automation handler read plan data that is not part of the workflow diagram itself', async () => {
    const { bep, workflowId } = buildDisciplineBep()
    const runtime = new BepReaderRuntime()
    bep.engine.init({ runtime, storage: new BEP.MemoryStorage() })

    const instance = await bep.engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await bep.engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(runtime.seenDisciplineNames).toEqual(['Arquitectura'])
  })

  it('mutating this.bep inside a handler has no effect on the actual plan', async () => {
    const { bep, workflowId } = buildDisciplineBep()
    const runtime = new BepReaderRuntime({ mutate: true })
    bep.engine.init({ runtime, storage: new BEP.MemoryStorage() })

    const instance = await bep.engine.workflows.create(workflowId, externalAsset(), ACTOR)
    await bep.engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    // The mutation did land on the handler's own copy...
    expect(runtime.seenDisciplineNames).toEqual(['Mutated', 'Injected'])
    // ...but the real plan, read straight from bep.disciplines (not this.bep), is untouched.
    expect(bep.disciplines.list()).toEqual([{ id: 'ARQ', name: 'Arquitectura' }])
  })

  it('is a snapshot taken at Engine.init() — later plan changes are not visible to it', async () => {
    const { bep, workflowId } = buildDisciplineBep()
    const runtime = new BepReaderRuntime()
    bep.engine.init({ runtime, storage: new BEP.MemoryStorage() })

    const instance = await bep.engine.workflows.create(workflowId, externalAsset(), ACTOR)
    // Added to the real plan after Engine.init() already cloned it — this.bep
    // must not pick it up, however live-looking `this.bep.disciplines` reads.
    bep.disciplines.add([{ id: 'EST', name: 'Estructura' }])
    await bep.engine.workflows.emit(instance!.id, { eventId: 'go', actor: ACTOR })

    expect(runtime.seenDisciplineNames).toEqual(['Arquitectura'])
    // Sanity check: the real plan did get the second discipline — it's this.bep specifically that missed it.
    expect(bep.disciplines.list().map(d => d.name)).toEqual(['Arquitectura', 'Estructura'])
  })

  it('throws if accessed before Engine.init()', () => {
    class BareRuntime extends BEP.Runtime {}
    const runtime = new BareRuntime({})
    expect(() => runtime.bep).toThrow(/not available yet/i)
  })
})
