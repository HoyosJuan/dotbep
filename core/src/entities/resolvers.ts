import type { BEP, Resolver } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { ResolverSchema } from '../types/schema.js'

export class Resolvers extends Entity<Resolver> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().resolvers,
      getBep,
      {
        key: 'resolvers',
        schema: ResolverSchema,
        beforeRemove: (id, bep) => {
          const ref = bep.remoteData.find(r => r.resolverId === id)
          if (ref) throw new Error(`Referenced by: remoteData["${ref.id}"].resolverId`)
        },
      },
    )
  }
}
