import type { Annex, BEP, Guide } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { GuideSchema } from '../types/schema.js'
import type { GuideResolved } from '../types/resolved.js'

export class Guides extends Entity<Guide, true> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().guides,
      getBep,
      {
        key: 'guides',
        schema: GuideSchema,
        autoId: true,
      },
    )
  }

  listResolved(): GuideResolved[] {
    const bep = this.getBep()
    return bep.guides.map(g => ({
      ...g,
      annexes: (g.annexIds ?? []).map(id => bep.annexes.find(a => a.id === id)).filter(Boolean) as Annex[],
    }))
  }
}
