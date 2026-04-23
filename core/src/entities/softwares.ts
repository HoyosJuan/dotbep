import type { BEP, Software } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { SoftwareSchema } from '../types/schema.js'
import type { AssetTypeResolved, SoftwareResolved } from '../types/resolved.js'
import type { AssetTypes } from './assetTypes.js'

export class Softwares extends Entity<Software> {
  constructor(getBep: () => BEP, private readonly getAssetTypes: () => AssetTypes) {
    super(
      () => getBep().softwares,
      getBep,
      {
        key: 'softwares',
        schema: SoftwareSchema,
      },
    )
  }

  listResolved(): SoftwareResolved[] {
    const assetTypeMap = new Map(this.getAssetTypes().listResolved().map(dt => [dt.id, dt]))
    return this.getBep().softwares.map(s => ({
      ...s,
      assetTypes: (s.assetTypeIds ?? []).map(id => assetTypeMap.get(id)).filter(Boolean) as AssetTypeResolved[],
    }))
  }
}
