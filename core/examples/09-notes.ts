// part of: node --experimental-strip-types examples/run-all.ts  (use --09 to stop here)
//
// Covers: notes.
//
// Notes are the human layer of the BEP — annotations written by team members
// to record decisions, concerns, or confirmations that do not fit into the
// structured data. They are identified by the author's email, which must
// reference an existing member of the BEP.
//
// Because notes are authored by members, removing a member who has authored
// notes is blocked by referential integrity. The constraint is released only
// when the note itself is deleted first.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Notes ────────────────────────────────────────────────────────────────────

// Notes are authored by members (identified by email) and carry a free-text
// message and a creation timestamp. The memberEmail must reference a member
// already registered in the BEP — unknown authors are rejected individually.

console.log('=== notes ===')

// notes are human annotations authored by BEP members (identified by email)
const notesAdded = bep.notes.add([
  {
    message:     'LOD 300 definition confirmed with client in meeting of 2026-03-15.',
    memberEmail: 'alice@arc.com',
    createdAt:   '2026-03-15T10:00:00Z',
  },
  {
    message:     'Structure team has not confirmed milestone M2 date yet.',
    memberEmail: 'bob@arc.com',
    createdAt:   '2026-03-16T09:00:00Z',
  },
  {
    message:     'Bad author.',
    memberEmail: 'ghost@x.com',   // fails — not a registered member
    createdAt:   '2026-03-16T09:00:00Z',
  },
])
const n1Id = notesAdded.succeeded[0].id
const n2Id = notesAdded.succeeded[1].id
console.log('add succeeded:', notesAdded.succeeded.map(n => n.message.slice(0, 50)))
console.log('add failed:   ', notesAdded.failed)

// sparse update — only message or other fields can be patched
const notesUpdated = bep.notes.update([
  { id: n2Id,       message: 'Structure team confirmed: M2 date is 2027-03-31.' },
  { id: 'ghost-id', message: 'Ghost' },   // fails — id not found
])
console.log('\nupdate succeeded:', notesUpdated.succeeded.map(n => n.message.slice(0, 50)))
console.log('update failed:   ', notesUpdated.failed)

console.log('\n--- integrity: member with authored notes cannot be removed ---')
const aliceBlocked = bep.members.remove(['alice@arc.com'])
console.log('remove alice (blocked by note.memberEmail):', aliceBlocked.failed)

// removing the note frees the member constraint for that note
const noteRemoved = bep.notes.remove([n1Id, 'ghost-note'])
console.log('\nremove n1 succeeded:', noteRemoved.succeeded)
console.log('remove ghost failed: ', noteRemoved.failed)

// alice can now be removed (her only note was n1Id, which was just deleted)
// — not doing it here to keep alice in the BEP for subsequent examples

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
