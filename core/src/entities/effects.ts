import type { BEP, FlowEffect } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { FlowEffectSchema } from '../types/schema.js'

export class Effects extends Entity<FlowEffect> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().effects,
      getBep,
      {
        key: 'effects',
        schema: FlowEffectSchema,
        beforeRemove: (id, bep) => {
          for (const wf of bep.workflows) {
            for (const [nodeKey, node] of Object.entries(wf.diagram.nodes)) {
              if (node.timeout?.effectId === id)
                throw new Error(`Referenced by: workflows["${wf.id}"].diagram.nodes["${nodeKey}"].timeout.effectId`)
            }
            for (const [edgeKey, edge] of Object.entries(wf.diagram.edges)) {
              if (edge.effectIds?.includes(id))
                throw new Error(`Referenced by: workflows["${wf.id}"].diagram.edges["${edgeKey}"].effectIds`)
            }
          }
        },
      },
    )
  }
}
