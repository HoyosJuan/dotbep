import type { BEP } from '../types/schema.js'
import type { ResolvedReferenceNode, ResolvedReferenceDomain } from '../types/resolved.js'
import { resolveBepRefs } from './bepRefs.js'

/**
 * Reconstructs an information domain's referenceData nodes into a nested
 * object, keyed by each node's own `key` (unique among siblings sharing the
 * same parent, not globally) — never stored this way, only computed on
 * demand (see docs/adrs/no-persisted-derivable-data.md).
 *
 * Every node is represented uniformly as `{ label, description?, data?,
 * children? }`, regardless of whether it actually has data, children, both,
 * or neither — one predictable shape for any consumer, no special-casing
 * depending on what a given node happens to carry. {{...}} references inside
 * a node's `data` are resolved against the live BEP, same grammar as
 * anywhere else (`resolveBepRefs`) — which is why this function is async:
 * JSONata's evaluate() always returns a Promise, even for expressions with
 * no async operations.
 *
 * A plain function, not a method on `InformationDomains` — deliberately, so
 * it's callable with just a `bep` object and no `Entity` instance. That's
 * exactly what a runtime handler has (`this.bep` is a plain `Readonly<BEP>`
 * snapshot, per `runtime-readonly-bep-snapshot.md` — never an `Entity`), so
 * this is the only way a handler can resolve a domain at all.
 * `InformationDomains.resolve()` is a thin wrapper around this for authoring-time use.
 */
export async function resolveInformationDomain(domainId: string, bep: BEP): Promise<ResolvedReferenceDomain> {
  if (!bep.informationDomains.some(d => d.id === domainId))
    throw new Error(`Domain not found: ${domainId}`)

  const childrenByParent = new Map<string | undefined, typeof bep.referenceData>()
  for (const node of bep.referenceData) {
    if (node.informationDomainId !== domainId) continue
    const siblings = childrenByParent.get(node.parentId) ?? []
    siblings.push(node)
    childrenByParent.set(node.parentId, siblings)
  }

  const buildLevel = async (parentId: string | undefined): Promise<ResolvedReferenceDomain> => {
    const level: ResolvedReferenceDomain = {}
    const nodes = childrenByParent.get(parentId) ?? []
    const built = await Promise.all(nodes.map(async node => {
      const resolved: ResolvedReferenceNode = { label: node.label }
      if (node.description) resolved.description = node.description
      if (node.data) resolved.data = await resolveBepRefs(node.data, bep) as Record<string, unknown>
      const children = await buildLevel(node.id)
      if (Object.keys(children).length) resolved.children = children
      return { key: node.key, resolved }
    }))
    for (const { key, resolved } of built) level[key] = resolved
    return level
  }

  return buildLevel(undefined)
}
