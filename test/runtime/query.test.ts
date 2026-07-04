import { describe, it, expect } from 'vitest'
import { buildInstanceProjection, matchesQuery, pendingForActorQuery } from '../../src/runtime/query.js'
import { ACTOR, buildEffectBep, buildQueryTestBep, createTestEngine, externalAsset, instanceAt } from '../helpers.js'

describe('buildInstanceProjection', () => {
  it('copies the instance\'s own fields as-is', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const instance = instanceAt(workflowId, 'byRole', { status: 'completed' })

    const projection = buildInstanceProjection(bep.data, instance)

    expect(projection).toMatchObject({
      id: 'test-instance', workflowId, status: 'completed', currentNodeId: 'byRole', initiatedBy: ACTOR,
    })
    expect(projection.trackedAsset).toEqual(instance.trackedAsset)
  })

  it('resolves the workflow name from the BEP', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byRole'))
    expect(projection.workflow).toEqual({ id: workflowId, name: 'Query test workflow' })
  })

  it('leaves workflow undefined when the instance points at a workflow that no longer exists', () => {
    const { bep } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt('ghost-workflow-id', 'byRole'))
    expect(projection.workflow).toBeUndefined()
  })

  it('resolves RACI from the current process node', () => {
    const { bep, workflowId, roleId, otherRoleId } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byRole'))

    expect(projection.raci.responsible.roleIds).toEqual([roleId])
    expect(projection.raci.accountable.roleIds).toEqual([otherRoleId])
    expect(projection.raci.hasResponsible).toBe(true)
    expect(projection.raci.hasAccountable).toBe(true)
  })

  it('resolves an all-empty RACI on a non-process node', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'end'))

    expect(projection.raci).toEqual({
      responsible: { roleIds: [], teamIds: [], emails: [] },
      accountable: { roleIds: [], teamIds: [], emails: [] },
      hasResponsible: false,
      hasAccountable: false,
    })
  })
})

describe('matchesQuery', () => {
  const { bep, workflowId } = buildQueryTestBep()
  const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byRole', { status: 'active' }))

  it('matches everything when where is absent or empty', () => {
    expect(matchesQuery(undefined, projection)).toBe(true)
    expect(matchesQuery([], projection)).toBe(true)
  })

  it('evaluates a single condition', () => {
    expect(matchesQuery([{ field: 'status', operator: 'eq', value: 'active' }], projection)).toBe(true)
    expect(matchesQuery([{ field: 'status', operator: 'eq', value: 'completed' }], projection)).toBe(false)
  })

  it('ANDs multiple top-level conditions', () => {
    const where = [
      { field: 'status', operator: 'eq' as const, value: 'active' },
      { field: 'currentNodeId', operator: 'eq' as const, value: 'byRole' },
    ]
    expect(matchesQuery(where, projection)).toBe(true)

    const failing = [
      { field: 'status', operator: 'eq' as const, value: 'active' },
      { field: 'currentNodeId', operator: 'eq' as const, value: 'somewhere-else' },
    ]
    expect(matchesQuery(failing, projection)).toBe(false)
  })

  it('evaluates a nested "or"', () => {
    const where = [{ or: [
      { field: 'currentNodeId', operator: 'eq' as const, value: 'nope' },
      { field: 'currentNodeId', operator: 'eq' as const, value: 'byRole' },
    ] }]
    expect(matchesQuery(where, projection)).toBe(true)
  })

  it('combines AND and OR — the "person or role, and internal tracked asset, and (id A or id B)" shape', () => {
    const where = [
      { or: [
        { field: 'raci.responsible.emails', operator: 'contains' as const, value: ACTOR },
        { field: 'raci.responsible.roleIds', operator: 'contains' as const, value: 'nonexistent-role' },
      ] },
      { field: 'trackedAsset.source', operator: 'eq' as const, value: 'internal' },
      { or: [
        { field: 'trackedAsset.id', operator: 'eq' as const, value: 'DELIVERABLE_A' },
        { field: 'trackedAsset.id', operator: 'eq' as const, value: 'DELIVERABLE_B' },
      ] },
    ]

    // 'byRole' is role-based, not email-based — the "or" for the person fails, so the whole AND fails
    // even though the tracked asset conditions alone would match.
    const roleBased = instanceAt(workflowId, 'byRole', {
      trackedAsset: { source: 'internal', type: 'deliverable', id: 'DELIVERABLE_A' },
    })
    expect(matchesQuery(where, buildInstanceProjection(bep.data, roleBased))).toBe(false)

    // 'byEmail' declares ACTOR directly — now every branch of the AND is satisfied.
    const emailBased = instanceAt(workflowId, 'byEmail', {
      trackedAsset: { source: 'internal', type: 'deliverable', id: 'DELIVERABLE_B' },
    })
    expect(matchesQuery(where, buildInstanceProjection(bep.data, emailBased))).toBe(true)
  })
})

describe('pendingForActorQuery', () => {
  const OTHER = 'other@test.com'
  const STRANGER = 'stranger@test.com'

  it('matches by role when the actor holds the responsible role', () => {
    const { bep, workflowId, otherRoleId } = buildQueryTestBep()
    bep.members.add([{ email: OTHER, name: 'Other', roleId: otherRoleId }])

    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byRole'))
    expect(matchesQuery(pendingForActorQuery(bep.data, ACTOR), projection)).toBe(true)
    expect(matchesQuery(pendingForActorQuery(bep.data, STRANGER), projection)).toBe(false)
  })

  it('does NOT fall back to accountable when a responsible party is declared, even for the accountable role holder', () => {
    const { bep, workflowId, otherRoleId } = buildQueryTestBep()
    bep.members.add([{ email: OTHER, name: 'Other', roleId: otherRoleId }])

    // 'byRole' declares responsible=roleId, accountable=otherRoleId. OTHER holds the accountable role
    // but must NOT be considered "pending" here, because a responsible party exists and OTHER isn't it.
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byRole'))
    expect(matchesQuery(pendingForActorQuery(bep.data, OTHER), projection)).toBe(false)
  })

  it('matches by team membership', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byTeam'))
    expect(matchesQuery(pendingForActorQuery(bep.data, ACTOR), projection)).toBe(true)
    expect(matchesQuery(pendingForActorQuery(bep.data, STRANGER), projection)).toBe(false)
  })

  it('matches by explicit email', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const projection = buildInstanceProjection(bep.data, instanceAt(workflowId, 'byEmail'))
    expect(matchesQuery(pendingForActorQuery(bep.data, ACTOR), projection)).toBe(true)
  })

  // The authoring API (bep.workflows.add) rejects a process node with no responsible at all —
  // schema-invalid, but the engine's RACI logic still defends against it (e.g. legacy data).
  // These two tests exercise that defensive path directly, bypassing the validated authoring API.
  it('falls back to accountable when no responsible party is declared at all (defensive path)', () => {
    const { bep, workflowId, roleId } = buildQueryTestBep()
    const data = structuredClone(bep.data)
    const node = data.workflows.find(w => w.id === workflowId)!.diagram.nodes['byRole'] as { responsibleRoleIds?: string[]; accountableRoleIds?: string[] }
    node.responsibleRoleIds = []
    node.accountableRoleIds = [roleId]

    const projection = buildInstanceProjection(data, instanceAt(workflowId, 'byRole'))
    expect(projection.raci.hasResponsible).toBe(false)
    expect(matchesQuery(pendingForActorQuery(data, ACTOR), projection)).toBe(true) // ACTOR holds roleId, now the only assignment
  })

  it('matches anyone when the node declares no RACI at all (defensive path)', () => {
    const { bep, workflowId } = buildQueryTestBep()
    const data = structuredClone(bep.data)
    const node = data.workflows.find(w => w.id === workflowId)!.diagram.nodes['byRole'] as { responsibleRoleIds?: string[]; accountableRoleIds?: string[] }
    node.responsibleRoleIds = []
    node.accountableRoleIds = []

    const projection = buildInstanceProjection(data, instanceAt(workflowId, 'byRole'))
    expect(matchesQuery(pendingForActorQuery(data, STRANGER), projection)).toBe(true)
  })
})

describe('Engine.workflows.list() with where', () => {
  it('filters persisted instances end to end', async () => {
    const { bep, workflowId } = buildEffectBep()
    const engine = createTestEngine(bep, { effects: { 'my-effect': async () => {} } })

    const stillActive = await engine.workflows.create(workflowId, externalAsset('Active one'), ACTOR)
    const toComplete   = await engine.workflows.create(workflowId, externalAsset('Completed one'), ACTOR)
    await engine.workflows.emit(toComplete!.id, { eventId: 'go', actor: ACTOR })

    const completed = await engine.workflows.list({ where: [{ field: 'status', operator: 'eq', value: 'completed' }] })
    expect(completed.map(i => i.id)).toEqual([toComplete!.id])

    const active = await engine.workflows.list({ where: [{ field: 'status', operator: 'eq', value: 'active' }] })
    expect(active.map(i => i.id)).toEqual([stillActive!.id])

    const all = await engine.workflows.list()
    expect(all).toHaveLength(2)
  })
})
