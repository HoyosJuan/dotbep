// Pure instance query engine — no I/O, no side effects.
// Builds a queryable projection per instance (joining BEP context where the
// instance itself doesn't carry it) and evaluates `InstanceQuery` trees
// against it, reusing the same field/operator/value vocabulary as EdgeGuard.

import type { BEP } from '../types/schema.js'
import { applyOperator } from './transitions.js'
import type {
  WorkflowInstance,
  InstanceQuery,
  InstanceQueryProjection,
  InstanceQueryRaciLevel,
} from './types.js'

// ─── Projection ─────────────────────────────────────────────────────────────

const EMPTY_RACI_LEVEL: InstanceQueryRaciLevel = { roleIds: [], teamIds: [], emails: [] }

/**
 * Builds the queryable projection for one instance: its own fields, plus
 * whatever the BEP resolves for its current position (workflow name, RACI at
 * the current node). Pure — safe to call once per instance per query.
 */
export function buildInstanceProjection(bep: BEP, instance: WorkflowInstance): InstanceQueryProjection {
  const workflow = bep.workflows.find(w => w.id === instance.workflowId)
  const node = workflow?.diagram.nodes[instance.currentNodeId]
  const raciNode = node?.type === 'process' ? node : undefined

  const responsible: InstanceQueryRaciLevel = raciNode
    ? { roleIds: raciNode.responsibleRoleIds ?? [], teamIds: raciNode.responsibleTeamIds ?? [], emails: raciNode.responsibleEmails ?? [] }
    : EMPTY_RACI_LEVEL
  const accountable: InstanceQueryRaciLevel = raciNode
    ? { roleIds: raciNode.accountableRoleIds ?? [], teamIds: raciNode.accountableTeamIds ?? [], emails: raciNode.accountableEmails ?? [] }
    : EMPTY_RACI_LEVEL

  return {
    id:            instance.id,
    workflowId:    instance.workflowId,
    status:        instance.status,
    currentNodeId: instance.currentNodeId,
    initiatedBy:   instance.initiatedBy,
    createdAt:     instance.createdAt,
    updatedAt:     instance.updatedAt,
    trackedAsset:  instance.trackedAsset,
    workflow:      workflow ? { id: workflow.id, name: workflow.name } : undefined,
    raci: {
      responsible,
      accountable,
      hasResponsible: responsible.roleIds.length > 0 || responsible.teamIds.length > 0 || responsible.emails.length > 0,
      hasAccountable: accountable.roleIds.length > 0 || accountable.teamIds.length > 0 || accountable.emails.length > 0,
    },
  }
}

// ─── Query evaluation ─────────────────────────────────────────────────────────

/** Resolves a dot-path (e.g. "raci.responsible.teamIds") against a nested object. */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

/** Evaluates a single condition, or recurses into a nested `and`/`or` group. Pure. */
export function evaluateInstanceQuery(query: InstanceQuery, projection: InstanceQueryProjection): boolean {
  if ('and' in query) return query.and.every(q => evaluateInstanceQuery(q, projection))
  if ('or'  in query) return query.or.some(q => evaluateInstanceQuery(q, projection))
  return applyOperator(query.operator, getByPath(projection, query.field), query.value)
}

/** Matches a projection against a `where` array. An empty or absent `where` matches everything. */
export function matchesQuery(where: InstanceQuery[] | undefined, projection: InstanceQueryProjection): boolean {
  if (!where || where.length === 0) return true
  return where.every(q => evaluateInstanceQuery(q, projection))
}

// ─── Convenience builders ─────────────────────────────────────────────────────

/**
 * Builds the `where` query for "this person has a pending action right now":
 * matches their role, team, or email against the node's RESPONSIBLE
 * assignment. Falls back to ACCOUNTABLE only when the node declares no
 * responsible party at all, and matches unconditionally when the node
 * declares neither (open to anyone).
 */
export function pendingForActorQuery(bep: BEP, actorEmail: string): InstanceQuery[] {
  const member  = bep.members.find(m => m.email === actorEmail)
  const roleId  = member?.roleId
  const teamIds = bep.teams.filter(t => (t.memberEmails ?? []).includes(actorEmail)).map(t => t.id)

  const matchesLevel = (level: 'responsible' | 'accountable'): InstanceQuery => ({
    or: [
      { field: `raci.${level}.emails`, operator: 'contains', value: actorEmail },
      ...(roleId ? [{ field: `raci.${level}.roleIds`, operator: 'contains' as const, value: roleId }] : []),
      ...teamIds.map(teamId => ({ field: `raci.${level}.teamIds`, operator: 'contains' as const, value: teamId })),
    ],
  })

  return [{
    or: [
      { and: [{ field: 'raci.hasResponsible', operator: 'eq', value: true }, matchesLevel('responsible')] },
      { and: [
        { field: 'raci.hasResponsible', operator: 'eq', value: false },
        { field: 'raci.hasAccountable', operator: 'eq', value: true },
        matchesLevel('accountable'),
      ] },
      { and: [
        { field: 'raci.hasResponsible', operator: 'eq', value: false },
        { field: 'raci.hasAccountable', operator: 'eq', value: false },
      ] },
    ],
  }]
}
