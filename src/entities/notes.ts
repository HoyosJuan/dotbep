import type { BEP, Note } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { NoteSchema } from '../types/schema.js'
import type { NoteResolved } from '../types/resolved.js'
import type { Members } from './members.js'

export class Notes extends Entity<Note, true> {
  constructor(getBep: () => BEP, private readonly getMembers: () => Members) {
    super(
      () => getBep().notes,
      getBep,
      {
        key: 'notes',
        schema: NoteSchema,
        autoId: true,
      },
    )
  }

  listResolved(): NoteResolved[] {
    const memberMap = new Map(this.getMembers().listResolved().map(m => [m.email, m]))
    return this.getBep().notes.map(n => ({
      ...n,
      member: memberMap.get(n.memberEmail) ?? null,
    }))
  }
}
