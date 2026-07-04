import type { BEP, LBSNode } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { LBSNodeSchema } from '../types/schema.js'
import { buildParentMap, getRootIds, resolveLBSCodes, validateLBS } from '../utils/lbs.js'
import type { LBSNodeResolved } from '../types/resolved.js'
import { validateTokenValue } from '../utils/naming.js'

export type LBSNodeAddInput = Omit<LBSNode, 'lbsNodeIds'> & { parentId?: string }
export type LBSNodeUpdateInput = Partial<Omit<LBSNode, 'lbsNodeIds'>> & { id: string; parentId?: string | null }

export class LBSNodes extends Entity<LBSNode> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().lbs,
      getBep,
      {
        key: 'lbs',
        schema: LBSNodeSchema,
        validate: (item, bep) => {
          const errors: string[] = []

          const token = item.type === 'zone' ? 'lbsZone' : 'lbsLocation'
          const tokenErr = validateTokenValue(token, item.id, bep.deliverableNamingConvention)
          if (tokenErr) errors.push(tokenErr)

          // Per-node check: location nodes cannot have zone children.
          // Root-must-be-zone and cycle detection are whole-tree invariants
          // — use validateTree() after building the full structure.
          if (item.type === 'location' && item.lbsNodeIds?.length) {
            const nodeMap = new Map(bep.lbs.map(n => [n.id, n]))
            for (const childId of item.lbsNodeIds ?? []) {
              if (nodeMap.get(childId)?.type === 'zone')
                errors.push(`Node "${item.id}" (location) cannot have a zone child ("${childId}").`)
            }
          }

          return errors
        },
      },
    )
  }

  listResolved(): LBSNodeResolved[] {
    const bep = this.getBep()
    const parentMap = buildParentMap(bep.lbs)
    const rootIds = getRootIds(bep.lbs)
    const nodeMap = new Map(bep.lbs.map(n => [n.id, n]))
    return bep.lbs.map(node => {
      const parentId = parentMap.get(node.id)
      const parentNode = parentId ? nodeMap.get(parentId) : undefined
      return {
        ...node,
        isRoot: rootIds.has(node.id),
        parent: parentNode ? { id: parentNode.id, name: parentNode.name, type: parentNode.type } : null,
        children: (node.lbsNodeIds ?? []).map(id => nodeMap.get(id)).filter(Boolean) as LBSNode[],
      }
    })
  }

  addNodes(items: LBSNodeAddInput[]): {
    succeeded: Array<LBSNode & { parentId: string | null }>
    failed: Array<{ input: unknown; error: string }>
  } {
    const bep = this.getBep()
    const succeeded: Array<LBSNode & { parentId: string | null }> = []
    const failed: Array<{ input: unknown; error: string }> = []

    for (const item of items) {
      if (!item.parentId && item.type !== 'zone') {
        failed.push({ input: item, error: 'Root nodes (no parentId) must be type "zone".' })
        continue
      }
      if (item.parentId && !bep.lbs.find(n => n.id === item.parentId)) {
        failed.push({ input: item, error: `No LBS node found with ID "${item.parentId}".` })
        continue
      }

      const { parentId, ...node } = item
      const addResult = this.add([node])
      if (addResult.failed.length > 0) {
        failed.push({ input: item, error: addResult.failed[0].error })
        continue
      }

      let parent: LBSNode | undefined
      if (parentId) {
        parent = bep.lbs.find(n => n.id === parentId)
        if (parent) {
          parent.lbsNodeIds ??= []
          parent.lbsNodeIds.push(item.id)
        }
      }

      const errors = this.validateTree()
      if (errors.length > 0) {
        bep.lbs.splice(bep.lbs.findIndex(n => n.id === item.id), 1)
        if (parent?.lbsNodeIds) parent.lbsNodeIds = parent.lbsNodeIds.filter(c => c !== item.id)
        failed.push({ input: item, error: errors.join('; ') })
        continue
      }

      succeeded.push({ ...bep.lbs.find(n => n.id === item.id)!, parentId: parentId ?? null })
    }

    return { succeeded, failed }
  }

  updateNodes(items: LBSNodeUpdateInput[]): {
    succeeded: Array<{
      id: string
      before: { name: string; type: string; description: string | undefined; parentId: string | null }
      after:  { name: string; type: string; description: string | undefined; parentId: string | null }
    }>
    failed: Array<{ id: string; error: string }>
  } {
    const bep = this.getBep()
    const succeeded: Array<{
      id: string
      before: { name: string; type: string; description: string | undefined; parentId: string | null }
      after:  { name: string; type: string; description: string | undefined; parentId: string | null }
    }> = []
    const failed: Array<{ id: string; error: string }> = []

    for (const item of items) {
      if (item.parentId && !bep.lbs.find(n => n.id === item.parentId)) {
        failed.push({ id: item.id, error: `No LBS node found with ID "${item.parentId}".` })
        continue
      }
      if (item.parentId === item.id) {
        failed.push({ id: item.id, error: 'A node cannot be its own parent.' })
        continue
      }

      const beforeNode = bep.lbs.find(n => n.id === item.id)
      const beforeParentId = buildParentMap(bep.lbs).get(item.id) ?? null

      const { parentId, ...fields } = item
      const updateResult = this.update([fields])
      if (updateResult.failed.length > 0) {
        failed.push({ id: item.id, error: updateResult.failed[0].error })
        continue
      }

      const before = { name: beforeNode!.name, type: beforeNode!.type, description: beforeNode!.description, parentId: beforeParentId }
      const node = bep.lbs.find(n => n.id === item.id)!

      if (parentId !== undefined) {
        for (const n of bep.lbs) {
          if (n.lbsNodeIds?.includes(item.id)) n.lbsNodeIds = n.lbsNodeIds.filter(c => c !== item.id)
        }
        if (parentId) {
          const newParent = bep.lbs.find(n => n.id === parentId)!
          newParent.lbsNodeIds ??= []
          newParent.lbsNodeIds.push(item.id)
        }
      }

      const errors = this.validateTree()
      if (errors.length > 0) {
        node.name = before.name
        node.type = before.type as 'zone' | 'location'
        if (before.description !== undefined) node.description = before.description
        else delete node.description
        if (parentId !== undefined) {
          for (const n of bep.lbs) {
            if (n.lbsNodeIds?.includes(item.id)) n.lbsNodeIds = n.lbsNodeIds.filter(c => c !== item.id)
          }
          if (before.parentId) {
            const prevParent = bep.lbs.find(n => n.id === before.parentId)
            if (prevParent) { prevParent.lbsNodeIds ??= []; prevParent.lbsNodeIds.push(item.id) }
          }
        }
        failed.push({ id: item.id, error: errors.join('; ') })
        continue
      }

      const afterParentId = buildParentMap(bep.lbs).get(node.id) ?? null
      succeeded.push({ id: item.id, before, after: { name: node.name, type: node.type, description: node.description, parentId: afterParentId } })
    }

    return { succeeded, failed }
  }

  /** Resolves zone and location codes for nomenclature given a node id. */
  resolveCodes(nodeId: string | undefined): { zoneCode: string; locationCode: string } {
    return resolveLBSCodes(nodeId, this.list())
  }

  /** Validates the full LBS tree and returns a list of structural errors. */
  validateTree(): string[] {
    return validateLBS(this.list())
  }
}
