import type { BEP, Role } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { RoleSchema } from '../types/schema.js'

export class Roles extends Entity<Role, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().roles,
      getBep,
      {
        key: 'roles',
        schema: RoleSchema,
        autoId: true,
        beforeRemove: (id, bep) => {
          const raciFields = ['responsibleRoleIds', 'accountableRoleIds', 'consultedRoleIds', 'informedRoleIds'] as const
          for (const wf of bep.workflows) {
            for (const [nodeKey, node] of Object.entries(wf.diagram.nodes)) {
              for (const field of raciFields) {
                if (node[field]?.includes(id))
                  throw new Error(`Referenced by: workflows["${wf.id}"].diagram.nodes["${nodeKey}"].${field}`)
              }
            }
          }
        },
      },
    )
  }
}
