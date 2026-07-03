import { describe, it, expect } from 'vitest'
import * as BEP from '../../src/index.js'
import { buildAutomationChainBep } from '../helpers.js'

// Minimal fixture builder — entities the diagram references (role, action, events,
// automations) without wiring a full workflow, so each test authors only the
// diagram shape it wants to exercise.
function baseBep() {
  const bep = BEP.Bep.create({ name: 'Cycle test', code: 'CYC', description: '' })
  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  const [{ id: actionId }] = bep.actions.add([{ name: 'Resolve' }]).succeeded

  bep.events.add([
    { id: 'go', name: 'Go' },
    { id: 'e1', name: 'E1' },
    { id: 'e2', name: 'E2' },
    { id: 'e3', name: 'E3' },
  ])

  // Empty `output` — keeps the guard-field-vs-predecessor-output check
  // (a separate rule) from interfering with these cycle-only fixtures.
  bep.automations.add([
    { id: 'auto1', name: 'Auto 1', description: 'Test automation.', payload: [], output: [] },
    { id: 'auto2', name: 'Auto 2', description: 'Test automation.', payload: [], output: [] },
    { id: 'auto3', name: 'Auto 3', description: 'Test automation.', payload: [], output: [] },
  ])

  return { bep, roleId, actionId }
}

describe('validateDiagram — synchronous cycle check', () => {
  it('rejects a direct decision → automation back edge (the original reported case)', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Direct back edge',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          auto1:   { type: 'automation', automationId: 'auto1' },
          dec1:    { type: 'decision', label: 'ok?' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'auto1', triggerEventId: 'go' },
          e3: { from: 'auto1',   to: 'dec1',  triggerEventId: 'e1' },
          e4: { from: 'dec1',    to: 'auto1', guard: { field: 'ok', operator: 'eq', value: true } }, // ← cycle
          e5: { from: 'dec1',    to: 'end',   guard: { field: 'ok', operator: 'eq', value: false } },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/synchronous cycle detected/)
    expect(result.failed[0]!.error).toMatch(/auto1/)
    expect(result.failed[0]!.error).toMatch(/dec1/)
  })

  it('rejects a longer automation chain that loops back into an earlier automation', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Chained back edge',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          auto1:   { type: 'automation', automationId: 'auto1' },
          auto2:   { type: 'automation', automationId: 'auto2' },
          auto3:   { type: 'automation', automationId: 'auto3' },
          dec1:    { type: 'decision', label: 'retry?' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'auto1', triggerEventId: 'go' },
          e3: { from: 'auto1',   to: 'auto2', triggerEventId: 'e1' },
          e4: { from: 'auto2',   to: 'auto3', triggerEventId: 'e2' },
          e5: { from: 'auto3',   to: 'dec1',  triggerEventId: 'e3' },
          e6: { from: 'dec1',    to: 'auto2', guard: { field: 'retry', operator: 'eq', value: true } }, // ← cycle back to auto2
          e7: { from: 'dec1',    to: 'end',   guard: { field: 'retry', operator: 'eq', value: false } },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/synchronous cycle detected/)
    expect(result.failed[0]!.error).toMatch(/auto2/)
    expect(result.failed[0]!.error).toMatch(/auto3/)
    expect(result.failed[0]!.error).toMatch(/dec1/)
    expect(result.failed[0]!.error).not.toMatch(/auto1/) // auto1 is upstream of the cycle, not part of it
  })

  it('rejects a decision-only cycle (no automation involved)', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Decision-only cycle',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          dec1:    { type: 'decision', label: 'first?' },
          dec2:    { type: 'decision', label: 'second?' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'dec1', triggerEventId: 'go' },
          e3: { from: 'dec1',    to: 'dec2', guard: { field: 'a', operator: 'eq', value: true } },
          e4: { from: 'dec1',    to: 'end',  guard: { field: 'a', operator: 'eq', value: false } },
          e5: { from: 'dec2',    to: 'dec1', guard: { field: 'b', operator: 'eq', value: true } }, // ← cycle
          e6: { from: 'dec2',    to: 'end',  guard: { field: 'b', operator: 'eq', value: false } },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/synchronous cycle detected/)
  })

  it('allows an automation → decision → process (human) → automation loop — the human step breaks the cycle', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Human-broken loop',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          auto1:   { type: 'automation', automationId: 'auto1' },
          dec1:    { type: 'decision', label: 'ok?' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'auto1',   triggerEventId: 'go' },
          e3: { from: 'auto1',   to: 'dec1',    triggerEventId: 'e1' },
          e4: { from: 'dec1',    to: 'resolve', guard: { field: 'ok', operator: 'eq', value: false } }, // back to a human step, not a cycle
          e5: { from: 'dec1',    to: 'end',     guard: { field: 'ok', operator: 'eq', value: true } },
        },
      },
    }])

    expect(result.failed).toHaveLength(0)
    expect(result.succeeded).toHaveLength(1)
  })

  it('accepts the shared automation-chain fixture used across the runtime test suite', () => {
    // buildAutomationChainBep()'s decision2 → resolve back edge lands on a process
    // node, so it must not be flagged despite decision1/decision2/auto1/auto2 all
    // sitting in the automation/decision subgraph together.
    const { bep, workflowId } = buildAutomationChainBep()
    expect(workflowId).toBeDefined()
    expect(bep.data.workflows.find(w => w.id === workflowId)).toBeDefined()
  })
})

describe('validateDiagram — reference and structural checks', () => {
  it('rejects a process node whose actionId does not exist', () => {
    const { bep, roleId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad actionId',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId: 'ghost-action', responsibleRoleIds: [roleId] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'go' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/actions\["ghost-action"\] not found \(node: resolve\)/)
  })

  it('rejects a process node whose responsibleRoleIds references a role that does not exist', () => {
    const { bep, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad role ref',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: ['ghost-role'] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'go' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/roles\["ghost-role"\] not found \(node: resolve\.responsibleRoleIds\)/)
  })

  it('rejects an edge whose "from" node does not exist in the diagram', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad edge from',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'go' },
          ghost: { from: 'nonexistent', to: 'end' }, // phantom edge, skipped by schema (fromNode lookup fails there too)
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/edge "ghost": from node "nonexistent" not found/)
  })

  it('rejects an edge whose "to" node does not exist in the diagram', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad edge to',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end',      triggerEventId: 'go' },
          e3: { from: 'resolve', to: 'nonexistent', triggerEventId: 'e1' }, // extra edge — process nodes may have several
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/edge "e3": to node "nonexistent" not found/)
  })

  it('rejects an edge whose triggerEventId does not exist', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad triggerEventId',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'ghost-event' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/events\["ghost-event"\] not found \(edge: e2\)/)
  })

  it('rejects an edge whose effectIds references an effect that does not exist', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad edge effectIds',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'go', effectIds: ['ghost-effect'] },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/effects\["ghost-effect"\] not found \(edge: e2\)/)
  })

  it('rejects an automation node whose automationId does not exist', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad automationId',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          auto1:   { type: 'automation', automationId: 'ghost-automation' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'auto1', triggerEventId: 'go' },
          e3: { from: 'auto1',   to: 'end',   triggerEventId: 'e1' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/automations\["ghost-automation"\] not found \(node: auto1\)/)
  })

  it('rejects a process node whose workflowId references a workflow that does not exist', () => {
    const { bep, roleId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad workflowId',
      diagram: {
        direction: 'LR',
        nodes: {
          start: { type: 'start' },
          spawn: { type: 'process', workflowId: 'ghost-workflow', responsibleRoleIds: [roleId] },
          end:   { type: 'end' },
        },
        edges: {
          e1: { from: 'start', to: 'spawn' },
          e2: { from: 'spawn', to: 'end', triggerEventId: 'go' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/workflows\["ghost-workflow"\] not found \(node: spawn\)/)
  })

  it('rejects a process node whose workflowId references its own workflow (self-reference)', () => {
    const { bep, roleId } = baseBep()
    const selfId = globalThis.crypto.randomUUID()

    const result = bep.workflows.add([{
      id: selfId, // bypasses the autoId typing to force a known id — the self-reference can only be tested this way
      name: 'Self-referencing sub-workflow',
      diagram: {
        direction: 'LR',
        nodes: {
          start: { type: 'start' },
          spawn: { type: 'process', workflowId: selfId, responsibleRoleIds: [roleId] },
          end:   { type: 'end' },
        },
        edges: {
          e1: { from: 'start', to: 'spawn' },
          e2: { from: 'spawn', to: 'end', triggerEventId: 'go' },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/node "spawn" references its own workflow — would cause infinite recursion/)
  })

  it('rejects a node timeout whose effectId does not exist', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Bad timeout effectId',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId], timeouts: [{ hours: 24, effectId: 'ghost-effect' }] },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end', triggerEventId: 'go' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/effects\["ghost-effect"\] not found \(node: resolve\.timeouts\)/)
  })

  it('rejects a node that no edge points to (unreachable)', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Unreachable node',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          orphan:  { type: 'process', actionId, responsibleRoleIds: [roleId] }, // has an outgoing edge, but nothing points to it
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end',    triggerEventId: 'go' },
          e3: { from: 'orphan',  to: 'end',    triggerEventId: 'e1' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/node "orphan" is unreachable — no edges point to it/)
  })

  it('rejects a node with no outgoing edges (workflow would get stuck)', () => {
    const { bep, roleId, actionId } = baseBep()

    const result = bep.workflows.add([{
      name: 'Dead end node',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          deadend: { type: 'process', actionId, responsibleRoleIds: [roleId] }, // reachable, but no outgoing edges
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'end',     triggerEventId: 'go' },
          e3: { from: 'resolve', to: 'deadend', triggerEventId: 'e1' },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/node "deadend" has no outgoing edges — workflow would get stuck here/)
  })

  it('rejects a decision guard field not declared in its direct predecessor automation\'s output', () => {
    const { bep, roleId, actionId } = baseBep()
    bep.automations.add([
      { id: 'auto-with-output', name: 'Auto with output', description: 'Test automation.', payload: [], output: [{ key: 'ok', type: 'boolean', required: true }] },
    ])

    const result = bep.workflows.add([{
      name: 'Undeclared guard field',
      diagram: {
        direction: 'LR',
        nodes: {
          start:   { type: 'start' },
          resolve: { type: 'process', actionId, responsibleRoleIds: [roleId] },
          auto1:   { type: 'automation', automationId: 'auto-with-output' },
          dec1:    { type: 'decision', label: 'ok?' },
          end:     { type: 'end' },
        },
        edges: {
          e1: { from: 'start',   to: 'resolve' },
          e2: { from: 'resolve', to: 'auto1', triggerEventId: 'go' },
          e3: { from: 'auto1',   to: 'dec1',  triggerEventId: 'e1' },
          // guards reference "wrong", but auto-with-output only declares "ok"
          e4: { from: 'dec1',    to: 'end',     guard: { field: 'wrong', operator: 'eq', value: true } },
          e5: { from: 'dec1',    to: 'resolve', guard: { field: 'wrong', operator: 'eq', value: false } },
        },
      },
    }])

    expect(result.succeeded).toHaveLength(0)
    expect(result.failed[0]!.error).toMatch(/guard field "wrong" on edge "e4" is not declared in any direct predecessor's output or payload \(node: dec1\)/)
  })
})
