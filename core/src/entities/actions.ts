import type { BEP, Action } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { ActionSchema } from '../types/schema.js'

export class Actions extends Entity<Action, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().actions,
      getBep,
      {
        key: 'actions',
        schema: ActionSchema,
        autoId: true,
        beforeRemove: (id, bep) => {
          for (const wf of bep.workflows) {
            for (const [nodeKey, node] of Object.entries(wf.diagram.nodes)) {
              if (node.actionId === id)
                throw new Error(`Referenced by: workflows["${wf.id}"].diagram.nodes["${nodeKey}"].actionId`)
            }
          }
        },
      },
    )
  }
}
