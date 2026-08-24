import type { BEP, InformationDomain } from '../types/schema.js'
import type { ResolvedReferenceDomain } from '../types/resolved.js'
import { Entity } from '../base/entity.js'
import { InformationDomainSchema } from '../types/schema.js'
import { resolveInformationDomain } from '../utils/referenceData.js'

export class InformationDomains extends Entity<InformationDomain> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().informationDomains,
      getBep,
      { key: 'informationDomains', schema: InformationDomainSchema },
    )
  }

  /**
   * See resolveInformationDomain() in utils/referenceData.ts — this is a thin
   * wrapper around it. Async because it resolves {{...}} references inside
   * each node's data, and JSONata's evaluate() is always async.
   */
  resolve(domainId: string): Promise<ResolvedReferenceDomain> {
    return resolveInformationDomain(domainId, this.getBep())
  }
}
