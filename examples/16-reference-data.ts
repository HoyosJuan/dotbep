// part of: node --experimental-strip-types examples/run-all.ts
//
// Covers: informationDomains, referenceData.
//
// Reference data is structured, domain-organized data meant to be queried by
// external integrations with certainty — a status enum, a CDE folder structure,
// a set of required file metadata fields — without an AI having to parse prose
// to guess at it. A domain (e.g. "topics", "cde") groups related information;
// each entry within it is a flat node (id, informationDomainId, key, label,
// parentId?, description?, data?). `key` is the technical identifier used to
// build the resolved object; `label` is the required human-readable one.
//
// Nodes are always stored flat — a tree is never persisted nested, only
// reconstructed on demand by informationDomains.resolve(domainId). This
// mirrors how LBS nodes work (flat + lbsNodeIds, reconstructed by
// utils/lbs.ts) but goes one step further: resolve() returns the fully
// reconstructed { key: { label, description?, data?, children? } } object
// directly, so a consumer never has to walk the flat list themselves.

import { readFileSync, writeFileSync } from 'node:fs'
import { Bep, resolveInformationDomain } from '../dist/index.js'

const bep = await Bep.open(readFileSync('examples/example.bep'))

// ─── Domains ────────────────────────────────────────────────────────────────

const domainsAdded = bep.informationDomains.add([
  { id: 'topics', name: 'Topics', description: 'Classification attributes for coordination topics/incidents.' },
  { id: 'cde', name: 'Common Data Environment', description: 'CDE folder structure and file metadata conventions.' },
])
console.log('domains added:', domainsAdded.succeeded.map(d => d.id))

// ─── Flat data — a "topics" enum, one level deep ─────────────────────────────

// key only needs to be unique among siblings sharing the same
// informationDomainId + parentId (here: all root-level under "topics") —
// never globally.
const statusAdded = bep.referenceData.add([
  { informationDomainId: 'topics', key: 'open',        label: 'Open',        data: { color: '#ef4444' } },
  { informationDomainId: 'topics', key: 'in_progress', label: 'In progress', data: { color: '#f59e0b' } },
  { informationDomainId: 'topics', key: 'resolved',    label: 'Resolved',    data: { color: '#10b981' } },
])
console.log('\nstatus nodes added:', statusAdded.succeeded.map(n => n.key))

// A string value in `data` can embed a {{JSONata expression}} — resolved
// fresh on every resolve() call against the live BEP, never baked in.
bep.referenceData.add([
  { informationDomainId: 'topics', key: 'default_reviewer', label: 'Default reviewer', data: { team: "{{teams[id='ARC'].name}}" } },
])

// ─── Hierarchical data — CDE folder structure ────────────────────────────────

const wip = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP' }]).succeeded[0]
bep.referenceData.add([
  { informationDomainId: 'cde', key: 'Structural', label: 'Structural', parentId: wip.id },
  { informationDomainId: 'cde', key: 'MEP',        label: 'MEP',        parentId: wip.id },
])
bep.referenceData.add([
  { informationDomainId: 'cde', key: 'Shared',    label: 'Shared' },
  { informationDomainId: 'cde', key: 'Published', label: 'Published' },
  { informationDomainId: 'cde', key: 'Archive',   label: 'Archive' },
])

// ─── resolve() — flat storage in, nested object out ──────────────────────────
//
// Async: resolving a domain resolves every {{...}} reference inside each
// node's data, and JSONata's evaluate() always returns a Promise.

console.log('\ntopics resolved:')
console.log(JSON.stringify(await bep.informationDomains.resolve('topics'), null, 2))

console.log('\ncde resolved (note: still just flat nodes in bep.referenceData.list()):')
console.log(JSON.stringify(await bep.informationDomains.resolve('cde'), null, 2))
console.log('flat node count for cde:', bep.referenceData.list().filter(n => n.informationDomainId === 'cde').length)

// ─── Integrity: sibling key collisions and referential checks ───────────────

// Same key "status" is fine across different parents/domains — uniqueness is
// per-sibling, not global.
const sameKeyDifferentParents = bep.referenceData.add([
  { informationDomainId: 'topics', key: 'status', label: 'Status' },
  { informationDomainId: 'cde', key: 'status', label: 'Status', parentId: wip.id },
])
console.log('\nsame key, different parents — both succeed:', sameKeyDifferentParents.succeeded.map(n => n.key))

// But a duplicate key under the exact same domain + parent is rejected.
const duplicateKey = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open (duplicate)' }])
console.log('duplicate sibling key rejected:', duplicateKey.failed)

// Removing a domain that still has nodes, or a node that is still a parent, is blocked —
// same referential-integrity pattern every other core entity already uses.
const blockedDomainRemoval = bep.informationDomains.remove(['topics'])
console.log('\nremove domain with pending nodes failed:', blockedDomainRemoval.failed)

const blockedNodeRemoval = bep.referenceData.remove([wip.id])
console.log('remove parent node with children failed:', blockedNodeRemoval.failed)

// A {{...}} reference inside `data` is NOT validated at write time (JSONata's
// evaluate() is always async, and write-time validation runs inside a
// synchronous hook — see docs/adrs/no-async-write-time-validation.md), so
// this save succeeds even though the reference doesn't resolve.
const brokenRef = bep.referenceData.add([{ informationDomainId: 'cde', key: 'ghost_ref', label: 'Ghost ref', data: { team: "{{teams[id='ghost'].name}}" } }])
console.log('\nnode with an unresolvable {{...}} reference still saves:', brokenRef.succeeded.map(n => n.key))
const ghostResolved = await bep.informationDomains.resolve('cde')
console.log('...but resolving it shows a visible marker instead of the value:', ghostResolved['ghost_ref']?.data?.['team'])

// The reference also runs the other way: an entity a referenceData node still
// points to cannot be deleted, same as any other referential-integrity check
// — this one IS still enforced at write time (well, at delete time), because
// it only has to parse the reference's syntax tree, never evaluate it, so it
// stays fully synchronous.
const blockedTeamRemoval = bep.teams.remove(['ARC'])
console.log('remove team referenced by referenceData failed:', blockedTeamRemoval.failed)

// A parentId that would create a cycle, or that points to a node in a
// different domain, is rejected — either would otherwise leave the node
// silently unreachable from every domain's resolve() output, with no error.
const structural = bep.referenceData.list().find(n => n.key === 'Structural')!
const cycleAttempt = bep.referenceData.update([{ id: wip.id, parentId: structural.id }])
console.log('\nparentId cycle rejected:', cycleAttempt.failed)

const crossDomainAttempt = bep.referenceData.add([{ informationDomainId: 'topics', key: 'cde_shared_alias', label: 'CDE shared alias', parentId: wip.id }])
console.log('cross-domain parentId rejected:', crossDomainAttempt.failed)

// ─── resolveInformationDomain() — the standalone function, no Entity needed ────
//
// A runtime handler only ever has `this.bep`, a plain Readonly<BEP> snapshot —
// never an Entity instance — so InformationDomains.resolve() (a class method)
// is unreachable from there. resolveInformationDomain(domainId, bep) is the
// same algorithm as a plain function, callable with just a bep object.
// InformationDomains.resolve() is a thin wrapper around it for authoring-time use.

const topicsViaFunction = await resolveInformationDomain('topics', bep.data)
console.log('\nresolveInformationDomain() matches entity.resolve():',
  JSON.stringify(topicsViaFunction) === JSON.stringify(await bep.informationDomains.resolve('topics')))

// ─── generateRuntimeTypes() — per-domain interfaces from live referenceData ────
//
// Each domain gets its own named interface (BepReferenceData<Domain>), typed
// per-node from its actual observed `data` fields — not inferred/guessed across
// siblings — plus a combined BepReferenceData interface keyed by domain id.

const types = await bep.generateRuntimeTypes()
console.log('\ngenerated types include BepReferenceDataTopics:', types.includes('export interface BepReferenceDataTopics'))
console.log('generated types include BepReferenceDataCde:', types.includes('export interface BepReferenceDataCde'))
console.log('BepTypes includes referenceData field:', types.includes('referenceData: BepReferenceData'))

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync('examples/example.bep', await bep.save())
console.log('\nSaved → examples/example.bep')
