import type { BEP, AssetType, Extension } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { AssetTypeSchema } from '../types/schema.js'
import type { AssetTypeResolved } from '../types/resolved.js'
import { validateTokenValue } from '../utils/naming.js'

export class AssetTypes extends Entity<AssetType> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().assetTypes,
      getBep,
      {
        key: 'assetTypes',
        schema: AssetTypeSchema,
        validate: (a, bep) => {
          const err = validateTokenValue('assetType', a.id, bep.deliverableNamingConvention)
          return err ? [err] : []
        },
      },
    )
  }

  listResolved(): AssetTypeResolved[] {
    const bep = this.getBep()
    return bep.assetTypes.map(dt => ({
      ...dt,
      extensions: (dt.extensionIds ?? []).map(id => bep.extensions.find(e => e.id === id)).filter(Boolean) as Extension[],
    }))
  }
}
