import type { BEP, ReferenceNode } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { ReferenceNodeSchema } from '../types/schema.js'
import { referencesEntity } from '../utils/bepRefs.js'

/**
 * True if walking parentId upward from `item` ever reaches `item.id` again.
 * A single-parent tree (one parentId per node, no childIds list) can never
 * produce a cycle reachable from a root — see docs/adrs/reference-data.md —
 * but an unreachable cycle still silently vanishes every node in it from
 * resolve()'s output, with no error. Caught here at the operation that would
 * close the loop, so one is never created in the first place.
 */
function createsCycle(item: ReferenceNode, bep: BEP): boolean {
  const byId = new Map(bep.referenceData.map(n => [n.id, n]))
  const visited = new Set<string>()
  let currentId = item.parentId
  while (currentId) {
    if (currentId === item.id) return true
    if (visited.has(currentId)) break // pre-existing cycle elsewhere — not this item's to report
    visited.add(currentId)
    currentId = byId.get(currentId)?.parentId
  }
  return false
}

export class ReferenceData extends Entity<ReferenceNode, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().referenceData,
      getBep,
      {
        key: 'referenceData',
        schema: ReferenceNodeSchema,
        autoId: true,
        validate: (item, bep) => {
          const errors: string[] = []

          // key only needs to be unique among siblings (same informationDomainId
          // + parentId), never globally — see docs/adrs/reference-data.md.
          const sibling = bep.referenceData.find(n =>
            n.id !== item.id &&
            n.informationDomainId === item.informationDomainId &&
            n.parentId === item.parentId &&
            n.key === item.key,
          )
          if (sibling) {
            errors.push(`key "${item.key}" already used by a sibling node ("${sibling.id}") under the same parent in domain "${item.informationDomainId}".`)
          }

          if (item.parentId) {
            // A node reachable from one domain's root must not have a parent
            // belonging to a different domain — resolve(domainId) filters
            // nodes by informationDomainId before walking the tree, so a
            // cross-domain parent silently strands the child outside every
            // domain's output.
            const parent = bep.referenceData.find(n => n.id === item.parentId)
            if (parent && parent.informationDomainId !== item.informationDomainId) {
              errors.push(`parentId "${item.parentId}" belongs to domain "${parent.informationDomainId}", not "${item.informationDomainId}" — a node's parent must be in the same domain.`)
            }

            if (createsCycle(item, bep)) {
              errors.push(`parentId "${item.parentId}" would create a cycle — a node cannot be an ancestor of itself.`)
            }
          }

          // {{...}} references inside data are NOT validated at write time —
          // JSONata's evaluate() is always async, and this hook runs inside a
          // synchronous Entity.add()/.update() call. A broken reference is
          // only ever caught on read, as a visible marker — see
          // docs/adrs/no-async-write-time-validation.md.

          return errors
        },
      },
    )
  }

  /**
   * Synchronously scans every node's `data` for a {{...}} reference to the
   * given collection/id. Wired generically into every entity's remove() via
   * GetBep, so deleting an entity that a referenceData node still points to
   * is blocked the same way any other referential-integrity violation is.
   * Sync because it only parses each reference's syntax (never evaluates it)
   * — see referencesEntity() in utils/bepRefs.ts.
   */
  findRefsTo(collection: string, id: string): string[] {
    return this.list()
      .filter(node => node.data && referencesEntity(node.data, collection, id))
      .map(node => `referenceData["${node.id}"].data`)
  }
}
