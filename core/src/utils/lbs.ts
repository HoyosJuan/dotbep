import type { LBSNode } from '../types/schema.js'

/** Maps nodeId → parentId for all nodes that have a parent. */
export function buildParentMap(lbs: LBSNode[]): Map<LBSNode['id'], LBSNode['id']> {
  const map = new Map<string, string>()
  for (const node of lbs) {
    for (const childId of node.lbsNodeIds ?? []) {
      map.set(childId, node.id)
    }
  }
  return map
}

/** IDs of root nodes (not referenced in any lbsNodeIds[]). */
export function getRootIds(lbs: LBSNode[]): Set<LBSNode['id']> {
  const allChildIds = new Set<LBSNode['id']>()
  for (const node of lbs) {
    for (const childId of node.lbsNodeIds ?? []) allChildIds.add(childId)
  }
  return new Set(lbs.map(n => n.id).filter(id => !allChildIds.has(id)))
}

/**
 * Resolves zone and location codes for nomenclature given an LBS node id.
 *
 * Rules:
 * - lbsNodeId absent               → zone = XXX, location = XXX
 * - node is root                   → zone = ZZZ, location = ZZZ
 * - node type === "zone" (non-root) → zone = id, location = ZZZ
 * - node type === "location"       → zone = nearest ancestor "zone" id, location = id
 */
export function resolveLBSCodes(
  lbsNodeId: LBSNode['id'] | undefined,
  lbs: LBSNode[],
): { zoneCode: string; locationCode: string } {
  if (!lbsNodeId) return { zoneCode: 'XXX', locationCode: 'XXX' }

  const nodeMap = new Map(lbs.map(n => [n.id, n]))
  const parentMap = buildParentMap(lbs)
  const rootIds = getRootIds(lbs)

  const node = nodeMap.get(lbsNodeId)
  if (!node) return { zoneCode: 'XXX', locationCode: 'XXX' }

  if (rootIds.has(node.id)) return { zoneCode: 'ZZZ', locationCode: 'ZZZ' }

  if (node.type === 'zone') return { zoneCode: node.id, locationCode: 'ZZZ' }

  // type === 'location' — walk up to find the nearest non-root zone ancestor
  let currentId: LBSNode['id'] | undefined = parentMap.get(node.id)
  while (currentId) {
    const ancestor = nodeMap.get(currentId)
    if (!ancestor) break
    if (ancestor.type === 'zone' && !rootIds.has(ancestor.id)) {
      return { zoneCode: ancestor.id, locationCode: node.id }
    }
    currentId = parentMap.get(currentId)
  }

  return { zoneCode: 'ZZZ', locationCode: node.id }
}

/**
 * Validates the LBS tree and returns a list of errors.
 * Checks: root nodes must be zones, locations cannot have zone children, no cycles.
 */
export function validateLBS(lbs: LBSNode[]): string[] {
  const errors: string[] = []
  const nodeMap = new Map(lbs.map(n => [n.id, n]))
  const rootIds = getRootIds(lbs)

  // Root nodes must be zones
  for (const id of rootIds) {
    const node = nodeMap.get(id)
    if (node && node.type !== 'zone') {
      errors.push(`Root node "${id}" must be of type "zone".`)
    }
  }

  // Location nodes cannot have zone children
  for (const node of lbs) {
    if (node.type === 'location') {
      for (const childId of node.lbsNodeIds ?? []) {
        const child = nodeMap.get(childId)
        if (child?.type === 'zone') {
          errors.push(`Node "${node.id}" (location) cannot have a zone child ("${childId}").`)
        }
      }
    }
  }

  // Cycle detection (DFS)
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true
    if (visited.has(id)) return false
    visited.add(id)
    inStack.add(id)
    for (const childId of nodeMap.get(id)?.lbsNodeIds ?? []) {
      if (dfs(childId)) {
        errors.push(`Cycle detected in LBS tree at node "${id}".`)
        return true
      }
    }
    inStack.delete(id)
    return false
  }

  for (const node of lbs) {
    if (!visited.has(node.id)) dfs(node.id)
  }

  return errors
}
