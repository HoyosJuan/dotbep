import type { BEP, FlowEvent } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { FlowEventSchema } from '../types/schema.js'

export class Events extends Entity<FlowEvent> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().events,
      getBep,
      {
        key: 'events',
        schema: FlowEventSchema,
        beforeRemove: (id, bep) => {
          for (const wf of bep.workflows) {
            for (const [edgeKey, edge] of Object.entries(wf.diagram.edges)) {
              if (edge.triggerEventId === id)
                throw new Error(`Referenced by: workflows["${wf.id}"].diagram.edges["${edgeKey}"].trigger`)
            }
          }
        },
      },
    )
  }
}
