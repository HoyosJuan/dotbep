// part of: node --experimental-strip-types examples/run-all.ts  (use --11 to stop here)
//
// Covers: listResolved() across all entity types. Read-only — no save.
//
// Every list() call returns raw entities with ID references (e.g. roleId: 'uuid').
// listResolved() replaces every ID with the full referenced object, so callers
// get a ready-to-render shape without performing any lookups themselves.
//
// This is particularly useful for the MCP — list_* tools always call
// listResolved() internally and return the enriched objects, so the LLM never
// needs to issue a follow-up call just to resolve a name.
//
// If a reference is broken (the referenced entity was deleted), listResolved()
// returns { id, name: null } instead of throwing, so the rest of the record
// remains usable.

import { readFileSync } from 'node:fs'
import { Bep } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── members ──────────────────────────────────────────────────────────────────

console.log('=== members.listResolved() ===')

const resolvedMembers = bep.members.listResolved()
const alice = resolvedMembers.find(m => m.email === 'alice@arc.com')!
console.log('alice role:            ', alice.role)               // { id, name, color }
console.log('alice team:            ', alice.team)               // { id: 'ARC', name: '...' }
console.log('alice isRepresentative:', alice.isRepresentative)   // true

// ─── teams ────────────────────────────────────────────────────────────────────

console.log('\n=== teams.listResolved() ===')

const resolvedTeams = bep.teams.listResolved()
const arc = resolvedTeams.find(t => t.id === 'ARC')!
console.log('ARC representative:', arc.representative?.name)
console.log('ARC members:       ', arc.members.map(m => m.name))
console.log('ARC disciplines:   ', arc.disciplines.map(d => d.id))

// ─── milestones ───────────────────────────────────────────────────────────────

console.log('\n=== milestones.listResolved() ===')

const resolvedMilestones = bep.milestones.listResolved()
for (const m of resolvedMilestones) {
  console.log(`  ${m.name} (${m.date}) → phase: ${m.phase?.name}`)
}

// ─── lbsNodes ─────────────────────────────────────────────────────────────────

console.log('\n=== lbsNodes.listResolved() ===')

const resolvedLbs = bep.lbsNodes.listResolved()
const site = resolvedLbs.find(n => n.id === 'SIT')!
const blkA = resolvedLbs.find(n => n.id === 'BLK')!
const p01  = resolvedLbs.find(n => n.id === 'P01')!

console.log('SIT  isRoot:', site.isRoot,  '| parent:', site.parent,      '| children:', site.children.map(c => c.id))
console.log('BLK isRoot:', blkA.isRoot,  '| parent:', blkA.parent?.id,  '| children:', blkA.children.map(c => c.id))
console.log('P01   isRoot:', p01.isRoot,   '| parent:', p01.parent?.id)

// ─── guides ───────────────────────────────────────────────────────────────────

console.log('\n=== guides.listResolved() ===')

const resolvedGuides = bep.guides.listResolved()
for (const g of resolvedGuides) {
  console.log(`  ${g.name}: annexes=[${g.annexes.map(a => a.name).join(', ')}]`)
}

// ─── workflows ────────────────────────────────────────────────────────────────

console.log('\n=== workflows.listResolved() ===')

const resolvedWorkflows = bep.workflows.listResolved()
const wf = resolvedWorkflows[0]
console.log('workflow:', wf.name)

const updateNode = wf.diagram.nodes['update']
if (updateNode) {
  console.log('update node action:     ', updateNode.action?.name)
  console.log('update node responsible:', updateNode.responsible.roles.map(r => r.name))
}

// ─── bimUses ──────────────────────────────────────────────────────────────────

console.log('\n=== bimUses.listResolved() ===')

const resolvedBimUses = bep.bimUses.listResolved()
for (const bu of resolvedBimUses) {
  console.log(`  ${bu.name}:`)
  console.log(`    objectives: [${bu.objectives.map(o => o.description.slice(0, 35)).join(' | ')}]`)
  console.log(`    software:   [${bu.software?.softwares.map(s => s.name).join(', ') ?? 'none'}]`)
  console.log(`    workflows:  [${bu.workflows.map(w => w.name).join(', ')}]`)
}

// ─── loin ─────────────────────────────────────────────────────────────────────

console.log('\n=== loin.listResolved() ===')

const resolvedLoin = bep.loin.listResolved()
for (const l of resolvedLoin) {
  console.log(`  ${l.element} (${l.discipline?.name}):`)
  for (const lm of l.milestones) {
    console.log(`    milestone=${lm.milestone?.name}  lod=${lm.lod?.name}  loi=${lm.loi?.name}`)
  }
}

// ─── deliverables ─────────────────────────────────────────────────────────────

console.log('\n=== deliverables.listResolved() ===')

const resolvedDelivs = bep.deliverables.listResolved()
for (const d of resolvedDelivs) {
  console.log(`  ${d.nomenclatureCode ?? d.id}`)
  console.log(`    discipline:  ${d.discipline?.name}`)
  console.log(`    assetType:   ${d.assetType?.name}`)
  console.log(`    responsible: ${d.responsible?.name}`)
  console.log(`    milestone:   ${d.milestone?.name}`)
  if (d.predecessor) console.log(`    predecessor: ${d.predecessor.id}`)
}

// ─── notes ────────────────────────────────────────────────────────────────────

console.log('\n=== notes.listResolved() ===')

const resolvedNotes = bep.notes.listResolved()
for (const n of resolvedNotes) {
  console.log(`  [${n.member?.name ?? '(unknown)'}] ${n.message.slice(0, 60)}`)
}

console.log('\nDone — no save (read-only example).')
