import type { BEP, RemoteData } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { RemoteDataSchema } from '../types/schema.js'

export class RemoteDataEntity extends Entity<RemoteData, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().remoteData,
      getBep,
      {
        key:    'remoteData',
        schema: RemoteDataSchema,
        autoId: true,
      },
    )
  }
}
