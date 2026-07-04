import type { BEP, FlowAutomation } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { FlowAutomationSchema } from '../types/schema.js'

export class Automations extends Entity<FlowAutomation> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().automations,
      getBep,
      {
        key: 'automations',
        schema: FlowAutomationSchema,
        beforeRemove: (id, bep) => {
          for (const wf of bep.workflows) {
            for (const [nodeKey, node] of Object.entries(wf.diagram.nodes)) {
              if (node.type === 'automation' && node.automationId === id)
                throw new Error(`Referenced by: workflows["${wf.id}"].diagram.nodes["${nodeKey}"].automationId`)
            }
          }
        },
      },
    )
  }
}
