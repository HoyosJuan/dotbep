// run: node --experimental-strip-types examples/01-participants.ts  (from core/)
//
// Covers: Bep.create(), roles, teams, members.
//
// A BEP starts with its participants: who is involved, what role they play,
// and which organization they belong to. This example builds that foundation.
//
// Roles describe functional responsibilities within the project (e.g. BIM Manager).
// Teams represent the contracting organizations (e.g. the architecture firm).
// Members are the individual people — each identified by email and assigned a role.
//
// The dependency chain is: Role ← Member ← Team. A member references a role;
// a team references its members. Deleting in the wrong order is blocked by
// referential integrity, as shown at the end of each section.

import { writeFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = Bep.create({ name: 'Example Project', code: 'EXP' })

// ─── Roles ────────────────────────────────────────────────────────────────────

// Roles are the functional positions that appear in RACI matrices and workflow
// diagrams. They are project-level, not tied to a specific person or team.
// The id is auto-generated (UUID) — capture it from the result to use later.

console.log('=== roles ===')

const rolesAdded = bep.roles.add([
  { name: 'BIM Manager',     color: '#E63946' },
  { name: 'BIM Coordinator', color: '#4444FF' },
])
const roleManagerId = rolesAdded.succeeded[0].id
const roleCoordId   = rolesAdded.succeeded[1].id
console.log('add succeeded:', rolesAdded.succeeded.map(r => r.name))

// update() is a sparse patch — only the fields included in the call are touched.
// Sending { id, color } leaves name and every other field unchanged.
const rolesUpdated = bep.roles.update([
  { id: roleManagerId, color: '#C1121F' },
  { id: 'ghost-uuid',  color: '#000000' },   // fails — id not found
])
console.log('update succeeded:', rolesUpdated.succeeded.map(r => r.id))
console.log('update failed:   ', rolesUpdated.failed)

// ─── Teams ────────────────────────────────────────────────────────────────────

// Teams represent the contracting parties defined in the appointment documents.
// Their id is a short readable code (e.g. 'ARC') that appears in deliverable
// naming codes, so it must be chosen carefully — it is not auto-generated.
// isoRole maps to the ISO 19650 appointment roles (lead-appointed-party, etc.).

console.log('\n=== teams ===')

const teamsAdded = bep.teams.add([
  { id: 'ARC', name: 'Architecture', isoRole: 'lead-appointed-party' },
  { id: 'STR', name: 'Structure',    isoRole: 'appointed-party'      },
  { id: 'ARC', name: 'Duplicate',    isoRole: 'appointed-party'      },   // fails — duplicate id
])
console.log('add succeeded:', teamsAdded.succeeded.map(t => t.id))
console.log('add failed:   ', teamsAdded.failed)

bep.teams.update([{ id: 'ARC', name: 'Architecture (Lead)' }])

// A team with no references can be freely removed.
const strRemoved = bep.teams.remove(['STR', 'XXX'])
console.log('remove STR succeeded:', strRemoved.succeeded)
console.log('remove XXX failed:   ', strRemoved.failed)

// project.clientId is set directly on bep.data — the client team is the
// appointing party and is referenced at the project level.
bep.data.project.clientId = 'ARC'

// Once a team is the project client, removing it would leave project.clientId
// pointing to a non-existent entity — integrity blocks the operation.
console.log('\n--- integrity: team referenced as project.clientId cannot be removed ---')
const arcBlocked = bep.teams.remove(['ARC'])
console.log('remove ARC (blocked by project.clientId):', arcBlocked.failed)

// ─── Members ──────────────────────────────────────────────────────────────────

// Members are the individual people who author and approve the BEP.
// Email is the natural key — it must be unique across the entire BEP.
// Each member is assigned exactly one role; the role must already exist.

console.log('\n=== members ===')

const membersAdded = bep.members.add([
  { email: 'alice@arc.com', name: 'Alice Mora',  roleId: roleManagerId },
  { email: 'bob@arc.com',   name: 'Bob Rivas',   roleId: roleCoordId   },
  { email: 'alice@arc.com', name: 'Duplicate',   roleId: roleManagerId }, // fails — duplicate email
  { email: 'ghost@x.com',   name: 'Ghost',       roleId: 'bad-role'    }, // fails — role not found
])
console.log('add succeeded:', membersAdded.succeeded.map(m => m.email))
console.log('add failed:   ', membersAdded.failed)

bep.members.update([
  { email: 'alice@arc.com', name: 'Alice Mora (BIM Manager)' },
  { email: 'nobody@x.com',  name: 'Ghost' },   // fails — email not found
])

// Teams are linked to their members via memberEmails. The representative is
// the single point of contact for the team — also referenced by email.
bep.teams.update([{
  id:                  'ARC',
  memberEmails:        ['alice@arc.com', 'bob@arc.com'],
  representativeEmail: 'alice@arc.com',
}])

// A member referenced by a team's memberEmails cannot be removed — doing so
// would silently orphan the team's roster.
console.log('\n--- integrity: member referenced by team cannot be removed ---')
const aliceBlocked = bep.members.remove(['alice@arc.com'])
console.log('remove alice (blocked by team.memberEmails):', aliceBlocked.failed)

// Similarly, a role referenced by any member cannot be removed — the member
// would be left without a valid functional role in the BEP.
console.log('\n--- integrity: role referenced by member cannot be removed ---')
const roleBlocked = bep.roles.remove([roleManagerId])
console.log('remove BIM Manager (blocked by alice.roleId):', roleBlocked.failed)

// ─── Save ─────────────────────────────────────────────────────────────────────

// save() returns a Buffer — the .bep zip in memory. Writing it to disk is the
// caller's responsibility; the core has no filesystem dependency.
writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
