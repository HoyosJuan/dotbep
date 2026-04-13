import type { BEP, FlowDiagram, Role, Workflow } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { WorkflowSchema } from '../types/schema.js'
import type { FlowNodeResolved, MemberResolved, RaciAssignment, RaciMatrix, RaciRow, TeamResolved, WorkflowResolved } from '../types/resolved.js'
import type { Members } from './members.js'
import type { Teams } from './teams.js'

function validateDiagram(diagram: FlowDiagram, bep: BEP): string[] {
  const errors: string[] = []
  for (const [nodeKey, node] of Object.entries(diagram.nodes)) {
    if (node.actionId && !bep.actions.some(a => a.id === node.actionId))
      errors.push(`actions["${node.actionId}"] not found (node: ${nodeKey})`)
    for (const field of ['responsibleRoleIds', 'accountableRoleIds', 'consultedRoleIds', 'informedRoleIds'] as const) {
      for (const roleId of node[field] ?? []) {
        if (!bep.roles.some(r => r.id === roleId))
          errors.push(`roles["${roleId}"] not found (node: ${nodeKey}.${field})`)
      }
    }
  }
  for (const [edgeKey, edge] of Object.entries(diagram.edges)) {
    if (!diagram.nodes[edge.from])
      errors.push(`edge "${edgeKey}": from node "${edge.from}" not found`)
    if (!diagram.nodes[edge.to])
      errors.push(`edge "${edgeKey}": to node "${edge.to}" not found`)
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
        validate: (item, bep) => validateDiagram(item.diagram, bep),
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
          ...node,
          action:      node.actionId ? bep.actions.find(a => a.id === node.actionId) ?? null : null,
          automation:  node.automationId ? bep.automations.find(s => s.id === node.automationId) ?? null : null,
          responsible: resolveRaciEntry(node.responsibleRoleIds),
          accountable: resolveRaciEntry(node.accountableRoleIds),
          consulted:   resolveRaciEntry(node.consultedRoleIds),
          informed:    resolveRaciEntry(node.informedRoleIds),
        }
      }
      return {
        ...w,
        diagram: { ...w.diagram, nodes: resolvedNodes },
      }
    })
  }
}
