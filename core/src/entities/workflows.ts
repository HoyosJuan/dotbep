import type { BEP, FlowDiagram, Role, Workflow } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { WorkflowSchema } from '../types/schema.js'
import type { FlowNodeResolved, MemberResolved, RaciAssignment, RaciMatrix, RaciRow, TeamResolved, WorkflowResolved } from '../types/resolved.js'
import type { Members } from './members.js'
import type { Teams } from './teams.js'

function validateDiagram(diagram: FlowDiagram, bep: BEP, workflowId: string): string[] {
  const errors: string[] = []

  // ── Node reference checks ──
  for (const [nodeKey, node] of Object.entries(diagram.nodes)) {
    if (node.type !== 'process') continue
    if (node.actionId && !bep.actions.some(a => a.id === node.actionId))
      errors.push(`actions["${node.actionId}"] not found (node: ${nodeKey})`)
    for (const field of ['responsibleRoleIds', 'accountableRoleIds', 'consultedRoleIds', 'informedRoleIds'] as const) {
      for (const roleId of node[field] ?? []) {
        if (!bep.roles.some(r => r.id === roleId))
          errors.push(`roles["${roleId}"] not found (node: ${nodeKey}.${field})`)
      }
    }
  }

  // ── Edge node reference checks ──
  for (const [edgeKey, edge] of Object.entries(diagram.edges)) {
    if (!diagram.nodes[edge.from])
      errors.push(`edge "${edgeKey}": from node "${edge.from}" not found`)
    if (!diagram.nodes[edge.to])
      errors.push(`edge "${edgeKey}": to node "${edge.to}" not found`)
    if ('triggerEventId' in edge && !bep.events.some(e => e.id === edge.triggerEventId))
      errors.push(`events["${edge.triggerEventId}"] not found (edge: ${edgeKey})`)
    for (const effectId of edge.effectIds ?? []) {
      if (!bep.effects.some(e => e.id === effectId))
        errors.push(`effects["${effectId}"] not found (edge: ${edgeKey})`)
    }
  }

  // ── Node catalog reference checks ──
  for (const [nodeKey, node] of Object.entries(diagram.nodes)) {
    if (node.type === 'automation' && !bep.automations.some(a => a.id === node.automationId))
      errors.push(`automations["${node.automationId}"] not found (node: ${nodeKey})`)

    if (node.type === 'process' && node.workflowId) {
      if (node.workflowId === workflowId)
        errors.push(`node "${nodeKey}" references its own workflow — would cause infinite recursion`)
      else if (!bep.workflows.some(w => w.id === node.workflowId))
        errors.push(`workflows["${node.workflowId}"] not found (node: ${nodeKey})`)
    }

    if ((node.type === 'process' || node.type === 'automation') && node.timeouts) {
      for (const timeout of node.timeouts) {
        if (!bep.effects.some(e => e.id === timeout.effectId))
          errors.push(`effects["${timeout.effectId}"] not found (node: ${nodeKey}.timeouts)`)
      }
    }
  }

  // ── Reachability checks ──
  const nodeKeys = Object.keys(diagram.nodes)
  const outgoingTargets = new Set(Object.values(diagram.edges).map(e => e.to))
  const outgoingSources = new Set(Object.values(diagram.edges).map(e => e.from))

  for (const nodeKey of nodeKeys) {
    const node = diagram.nodes[nodeKey]
    if (node.type === 'start') continue
    if (!outgoingTargets.has(nodeKey))
      errors.push(`node "${nodeKey}" is unreachable — no edges point to it`)
  }

  for (const nodeKey of nodeKeys) {
    const node = diagram.nodes[nodeKey]
    if (node.type === 'end') continue
    if (!outgoingSources.has(nodeKey))
      errors.push(`node "${nodeKey}" has no outgoing edges — workflow would get stuck here`)
  }

  // ── Guard field validation against predecessor outputs ──
  // For each decision node, collect the context fields its direct predecessors
  // produce (automation output or event payload), then verify every guard field
  // is declared among them. Skips validation when no field sources are known
  // (e.g. predecessor event has no declared payload), since context is cumulative
  // and earlier steps may have set the field.
  const incomingEdgeKeys: Record<string, string[]> = {}
  for (const edgeKey of Object.keys(diagram.edges)) {
    const edge = diagram.edges[edgeKey]
    incomingEdgeKeys[edge.to] ??= []
    incomingEdgeKeys[edge.to].push(edgeKey)
  }

  for (const [nodeKey, node] of Object.entries(diagram.nodes)) {
    if (node.type !== 'decision') continue

    const availableFields = new Set<string>()
    for (const inEdgeKey of incomingEdgeKeys[nodeKey] ?? []) {
      const inEdge = diagram.edges[inEdgeKey]
      const fromNode = diagram.nodes[inEdge.from]
      if (!fromNode) continue

      if (fromNode.type === 'automation') {
        const automation = bep.automations.find(a => a.id === fromNode.automationId)
        for (const f of automation?.output ?? []) availableFields.add(f.key)
      }

      if (fromNode.type === 'process' && 'triggerEventId' in inEdge) {
        const event = bep.events.find(e => e.id === inEdge.triggerEventId)
        for (const f of event?.payload ?? []) availableFields.add(f.key)
      }
    }

    if (availableFields.size === 0) continue

    for (const [outEdgeKey, outEdge] of Object.entries(diagram.edges)) {
      if (outEdge.from !== nodeKey) continue
      if (!('guard' in outEdge)) continue
      if (!availableFields.has(outEdge.guard.field))
        errors.push(`guard field "${outEdge.guard.field}" on edge "${outEdgeKey}" is not declared in any direct predecessor's output or payload (node: ${nodeKey})`)
    }
  }

  return errors
}

export class Workflows extends Entity<Workflow, true> {
  constructor(getBep: () => BEP, private readonly getMembers: () => Members, private readonly getTeams: () => Teams) {
    super(
      () => getBep().workflows,
      getBep,
      {
        key: 'workflows',
        schema: WorkflowSchema,
        autoId: true,
        validate: (item, bep) => validateDiagram(item.diagram, bep, item.id),
      },
    )
  }

  getRaciMatrix(): RaciMatrix {
    const bep = this.getBep()
    const rows: RaciRow[] = []
    const roleIds = new Set<string>()
    const resolvedMembers = this.getMembers().listResolved()
    const resolvedTeams   = this.getTeams().listResolved()

    const resolveAssignments = (ids: Role['id'][] | undefined): RaciAssignment[] =>
      (ids ?? []).flatMap(roleId => {
        const role = bep.roles.find(r => r.id === roleId)
        if (!role) return []
        roleIds.add(roleId)
        const members = resolvedMembers.filter(m => m.role?.id === roleId) as MemberResolved[]
        const team    = resolvedTeams.find(t => t.members.some(m => m.role?.id === roleId)) ?? null as TeamResolved | null
        return [{ role, members, team } satisfies RaciAssignment]
      })

    for (const workflow of bep.workflows) {
      for (const [nodeId, node] of Object.entries(workflow.diagram.nodes)) {
        if (node.type !== 'process') continue
        const action = node.actionId ? bep.actions.find(a => a.id === node.actionId) : undefined
        rows.push({
          workflow: { id: workflow.id, name: workflow.name },
          nodeId,
          label: action?.name ?? nodeId,
          ...(action?.description ? { description: action.description } : {}),
          ...(node.actionId ? { actionId: node.actionId } : {}),
          responsible: resolveAssignments(node.responsibleRoleIds),
          accountable: resolveAssignments(node.accountableRoleIds),
          consulted:   resolveAssignments(node.consultedRoleIds),
          informed:    resolveAssignments(node.informedRoleIds),
        } satisfies RaciRow)
      }
    }

    const roles = [...roleIds]
      .map(id => bep.roles.find(r => r.id === id))
      .filter(Boolean) as Role[]

    return { roles, rows }
  }

  getRaciMatrixForWorkflow(workflowId: Workflow['id']): RaciMatrix {
    const full = this.getRaciMatrix()
    const rows = full.rows.filter(r => r.workflow.id === workflowId)
    const usedRoleIds = new Set(
      rows.flatMap(r => [...r.responsible, ...r.accountable, ...r.consulted, ...r.informed].map(a => a.role.id))
    )
    return { roles: full.roles.filter(r => usedRoleIds.has(r.id)), rows }
  }

  getConsolidatedRaciMatrix(): RaciMatrix {
    const full = this.getRaciMatrix()
    const merged = new Map<string, RaciRow>()

    const mergeAssignments = (existing: RaciAssignment[], incoming: RaciAssignment[]): RaciAssignment[] => {
      const map = new Map(existing.map(a => [a.role.id, { ...a, members: [...a.members] }]))
      for (const item of incoming) {
        if (!map.has(item.role.id)) {
          map.set(item.role.id, { ...item, members: [...item.members] })
        } else {
          const entry = map.get(item.role.id)!
          const seen  = new Set(entry.members.map(m => m.email))
          for (const m of item.members) if (!seen.has(m.email)) entry.members.push(m)
        }
      }
      return [...map.values()]
    }

    for (const row of full.rows) {
      const key = row.actionId ?? `node:${row.workflow.id}:${row.nodeId}`
      if (!merged.has(key)) {
        merged.set(key, { ...row, workflow: { id: '', name: '' } })
      } else {
        const existing = merged.get(key)!
        existing.responsible = mergeAssignments(existing.responsible, row.responsible)
        existing.accountable = mergeAssignments(existing.accountable, row.accountable)
        existing.consulted   = mergeAssignments(existing.consulted,   row.consulted)
        existing.informed    = mergeAssignments(existing.informed,    row.informed)
      }
    }

    const rows = [...merged.values()]
    const usedRoleIds = new Set(
      rows.flatMap(r => [...r.responsible, ...r.accountable, ...r.consulted, ...r.informed].map(a => a.role.id))
    )
    return { roles: full.roles.filter(r => usedRoleIds.has(r.id)), rows }
  }

  listResolved(): WorkflowResolved[] {
    const bep = this.getBep()
    return bep.workflows.map(w => {
      const resolvedNodes: Record<string, FlowNodeResolved> = {}
      for (const [key, node] of Object.entries(w.diagram.nodes)) {
        const resolveRaciEntry = (roleIds?: string[]) => ({
          roles:   (roleIds ?? []).map(id => bep.roles.find(r => r.id === id)).filter(Boolean) as Role[],
          teams:   [] as import('../types/schema.js').Team[],
          members: [] as import('../types/schema.js').Member[],
        })
        resolvedNodes[key] = {
          type:        node.type,
          label:       node.type === 'decision' ? node.label : undefined,
          timeouts:    (node.type === 'process' || node.type === 'automation') ? node.timeouts : undefined,
          workflowId:  node.type === 'process' ? node.workflowId : undefined,
          blocking:    node.type === 'process' ? node.blocking : undefined,
          action:      node.type === 'process' && node.actionId ? bep.actions.find(a => a.id === node.actionId) ?? null : null,
          automation:  node.type === 'automation' ? bep.automations.find(s => s.id === node.automationId) ?? null : null,
          responsible: resolveRaciEntry(node.type === 'process' ? node.responsibleRoleIds : undefined),
          accountable: resolveRaciEntry(node.type === 'process' ? node.accountableRoleIds : undefined),
          consulted:   resolveRaciEntry(node.type === 'process' ? node.consultedRoleIds : undefined),
          informed:    resolveRaciEntry(node.type === 'process' ? node.informedRoleIds : undefined),
        }
      }
      return {
        ...w,
        diagram: { ...w.diagram, nodes: resolvedNodes },
      }
    })
  }
}
