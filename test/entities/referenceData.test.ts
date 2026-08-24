import { describe, it, expect } from 'vitest'
import * as BEP from '../../src/index.js'

function baseBep() {
  const bep = BEP.Bep.create({ name: 'Reference data test', code: 'RDT', description: '' })
  const [{ id: teamId }] = bep.teams.add([{ id: 'TM1', name: 'Structural Team', isoRole: 'appointed-party' }]).succeeded
  return { bep, teamId }
}

describe('InformationDomains.resolve()', () => {
  it('reconstructs a flat domain (no nesting) with data on every node', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    bep.referenceData.add([
      { informationDomainId: 'topics', key: 'open', label: 'Open', data: { color: '#ef4444' } },
      { informationDomainId: 'topics', key: 'in_progress', label: 'In progress', data: { color: '#f59e0b' } },
      { informationDomainId: 'topics', key: 'resolved', label: 'Resolved', data: { color: '#10b981' } },
    ])

    const resolved = await bep.informationDomains.resolve('topics')
    expect(resolved).toEqual({
      open: { label: 'Open', data: { color: '#ef4444' } },
      in_progress: { label: 'In progress', data: { color: '#f59e0b' } },
      resolved: { label: 'Resolved', data: { color: '#10b981' } },
    })
  })

  it('reconstructs a nested domain with data and children uniformly, computed fresh (never stored nested)', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'Common Data Environment' }])
    const added = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP' }])
    const wipId = added.succeeded[0]!.id
    bep.referenceData.add([
      { informationDomainId: 'cde', key: 'Structural', label: 'Structural', parentId: wipId },
      { informationDomainId: 'cde', key: 'MEP', label: 'MEP', parentId: wipId },
    ])
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'Published', label: 'Published' }])

    const resolved = await bep.informationDomains.resolve('cde')
    expect(resolved).toEqual({
      WIP: {
        label: 'WIP',
        children: {
          Structural: { label: 'Structural' },
          MEP: { label: 'MEP' },
        },
      },
      Published: { label: 'Published' },
    })

    // Underlying storage stays flat — never a nested tree.
    expect(bep.referenceData.list().every(n => !('children' in n))).toBe(true)
  })

  it('same key is allowed across different parents/domains — uniqueness is per-sibling, not global', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }, { id: 'cde', name: 'CDE' }])
    const wip = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP' }]).succeeded[0]!
    const shared = bep.referenceData.add([{ informationDomainId: 'cde', key: 'Shared', label: 'Shared' }]).succeeded[0]!

    const result = bep.referenceData.add([
      { informationDomainId: 'topics', key: 'status', label: 'Status' },
      { informationDomainId: 'cde', key: 'status', label: 'Status', parentId: wip.id },
      { informationDomainId: 'cde', key: 'status', label: 'Status', parentId: shared.id },
    ])
    expect(result.failed).toEqual([])
  })

  it('rejects a duplicate key among siblings sharing the same domain and parent', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }])
    const result = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/already used by a sibling/)
  })

  it('allows renaming a node to a key already used by itself (update does not collide with its own stale copy)', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const node = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }]).succeeded[0]!
    const result = bep.referenceData.update([{ id: node.id, label: 'Open (renamed)' }])
    expect(result.failed).toEqual([])
    expect(result.succeeded[0]!.key).toBe('open')
  })

  it('resolves {{...}} references inside data against the live BEP', async () => {
    const { bep, teamId } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    bep.referenceData.add([
      { informationDomainId: 'cde', key: 'shared_team_folder', label: 'Shared team folder', data: { name: `{{teams[id='${teamId}'].name}}` } },
    ])

    const resolved = await bep.informationDomains.resolve('cde')
    expect(resolved['shared_team_folder']!.data!['name']).toBe('Structural Team')
  })

  it('saves a node with a reference that does not currently resolve — no write-time validation (see docs/adrs/no-async-write-time-validation.md) — and shows a visible marker on resolve', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    const result = bep.referenceData.add([{ informationDomainId: 'cde', key: 'x', label: 'X', data: { team: "{{teams[id='ghost'].name}}" } }])
    expect(result.failed).toEqual([])

    const resolved = await bep.informationDomains.resolve('cde')
    expect(resolved['x']!.data!['team']).toContain('⚠')
  })

  it('throws for an unknown domain', async () => {
    const { bep } = baseBep()
    await expect(bep.informationDomains.resolve('ghost')).rejects.toThrow(/Domain not found/)
  })
})

describe('resolveInformationDomain() — standalone function, no Entity instance', () => {
  it('resolves given only a plain bep object, matching this.bep in a runtime handler (readonly snapshot, no Entity classes)', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open', data: { label: 'Open' } }])

    const { resolveInformationDomain } = BEP
    // bep.data is the same plain BEP shape a runtime handler gets as this.bep —
    // no Entity instance involved, just the raw snapshot.
    const resolved = await resolveInformationDomain('topics', bep.data)

    expect(resolved).toEqual({ open: { label: 'Open', data: { label: 'Open' } } })
    expect(resolved).toEqual(await bep.informationDomains.resolve('topics'))
  })
})

describe('referenceData / informationDomains — referential integrity', () => {
  it('rejects a node whose informationDomainId does not exist', () => {
    const { bep } = baseBep()
    const result = bep.referenceData.add([{ informationDomainId: 'ghost', key: 'x', label: 'X' }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/informationDomains\["ghost"\] not found/)
  })

  it('rejects a node whose parentId does not exist', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const ghostParentId = '00000000-0000-4000-8000-000000000000'
    const result = bep.referenceData.add([{ informationDomainId: 'topics', key: 'x', label: 'X', parentId: ghostParentId }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(new RegExp(`referenceData\\["${ghostParentId}"\\] not found`))
  })

  it('rejects a node that references itself as parentId', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const node = bep.referenceData.add([{ informationDomainId: 'topics', key: 'x', label: 'X' }]).succeeded[0]!
    const result = bep.referenceData.update([{ id: node.id, parentId: node.id }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/cannot reference itself/)
  })

  it('rejects an indirect cycle in parentId (A parent of B, then B updated to parent of A)', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const a = bep.referenceData.add([{ informationDomainId: 'topics', key: 'a', label: 'A' }]).succeeded[0]!
    const b = bep.referenceData.add([{ informationDomainId: 'topics', key: 'b', label: 'B', parentId: a.id }]).succeeded[0]!

    const result = bep.referenceData.update([{ id: a.id, parentId: b.id }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/would create a cycle/)
  })

  it('rejects a longer indirect cycle (A → B → C → A)', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const a = bep.referenceData.add([{ informationDomainId: 'topics', key: 'a', label: 'A' }]).succeeded[0]!
    const b = bep.referenceData.add([{ informationDomainId: 'topics', key: 'b', label: 'B', parentId: a.id }]).succeeded[0]!
    const c = bep.referenceData.add([{ informationDomainId: 'topics', key: 'c', label: 'C', parentId: b.id }]).succeeded[0]!

    const result = bep.referenceData.update([{ id: a.id, parentId: c.id }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/would create a cycle/)
  })

  it('allows re-parenting a node to a non-cyclic ancestor elsewhere in the same domain', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const a = bep.referenceData.add([{ informationDomainId: 'topics', key: 'a', label: 'A' }]).succeeded[0]!
    const b = bep.referenceData.add([{ informationDomainId: 'topics', key: 'b', label: 'B' }]).succeeded[0]!
    const c = bep.referenceData.add([{ informationDomainId: 'topics', key: 'c', label: 'C', parentId: a.id }]).succeeded[0]!

    const result = bep.referenceData.update([{ id: c.id, parentId: b.id }])
    expect(result.failed).toEqual([])
    expect(result.succeeded[0]!.parentId).toBe(b.id)
  })

  it('rejects a node whose parentId belongs to a different domain', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }, { id: 'cde', name: 'CDE' }])
    const topicsRoot = bep.referenceData.add([{ informationDomainId: 'topics', key: 'status', label: 'Status' }]).succeeded[0]!

    const result = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP', parentId: topicsRoot.id }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/belongs to domain "topics", not "cde"/)
  })

  it('a node with a cross-domain or cyclic parentId would otherwise vanish silently from resolve() — regression guard', async () => {
    // Documents *why* the two checks above matter: without them, this node
    // would still be listed by bep.referenceData.list() but never appear in
    // any domain's resolve() output, with no error anywhere.
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }, { id: 'cde', name: 'CDE' }])
    const topicsRoot = bep.referenceData.add([{ informationDomainId: 'topics', key: 'status', label: 'Status' }]).succeeded[0]!
    const blocked = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP', parentId: topicsRoot.id }])
    expect(blocked.succeeded).toEqual([])

    // Confirm resolve() for both domains is exactly what was actually written — no orphan.
    expect(await bep.informationDomains.resolve('cde')).toEqual({})
    expect(await bep.informationDomains.resolve('topics')).toEqual({ status: { label: 'Status' } })
  })

  it('blocks removing a domain that still has referenceData nodes', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }])

    const result = bep.informationDomains.remove(['topics'])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/Referenced by:.*referenceData/)
  })

  it('blocks removing a node that is still the parent of another node', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    const wip = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP' }]).succeeded[0]!
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'Structural', label: 'Structural', parentId: wip.id }])

    const result = bep.referenceData.remove([wip.id])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/Referenced by:.*referenceData/)
  })

  it('allows removing a domain and its nodes once the nodes are removed first', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const node = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }]).succeeded[0]!

    expect(bep.referenceData.remove([node.id]).succeeded).toEqual([node.id])
    expect(bep.informationDomains.remove(['topics']).succeeded).toEqual(['topics'])
  })

  it('blocks removing another BEP entity (e.g. a team) that a referenceData node still references', () => {
    const { bep, teamId } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'shared_team_folder', label: 'Shared team folder', data: { name: `{{teams[id='${teamId}'].name}}` } }])

    const result = bep.teams.remove([teamId])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/Referenced by:.*referenceData\[.*\]\.data/)

    // Still there — the block actually prevented the mutation.
    expect(bep.teams.list().some(t => t.id === teamId)).toBe(true)
  })

  it('allows removing that entity again once the referenceData node no longer references it', () => {
    const { bep, teamId } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    const node = bep.referenceData.add([{ informationDomainId: 'cde', key: 'shared_team_folder', label: 'Shared team folder', data: { name: `{{teams[id='${teamId}'].name}}` } }]).succeeded[0]!

    expect(bep.teams.remove([teamId]).failed).toHaveLength(1)

    bep.referenceData.update([{ id: node.id, data: {} }])
    expect(bep.teams.remove([teamId]).succeeded).toEqual([teamId])
  })

  it('blocks removing a referenceData node that another node\'s data still references (self-reference, no special-casing needed)', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }, { id: 'cde', name: 'CDE' }])
    const target = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }]).succeeded[0]!
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'default_status', label: 'Default status', data: { ref: `{{referenceData[id='${target.id}'].key}}` } }])

    const result = bep.referenceData.remove([target.id])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/Referenced by:.*referenceData\[.*\]\.data/)
  })
})

describe('generateRuntimeTypes() — BepReferenceData', () => {
  it('generates a named interface per domain, typed per-node from actual data, plus a combined BepReferenceData in BepTypes', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    bep.referenceData.add([
      { informationDomainId: 'topics', key: 'open', label: 'Open', data: { color: '#ef4444' } },
      { informationDomainId: 'topics', key: 'no_data', label: 'No data' },
    ])

    const types = await bep.generateRuntimeTypes()

    expect(types).toContain('export interface BepReferenceDataTopics {')
    expect(types).toContain('"open": {')
    expect(types).toContain('label: string')
    expect(types).toContain('"color": string')
    expect(types).toContain('"no_data": {')
    expect(types).toContain('export interface BepReferenceData {')
    expect(types).toContain('"topics": BepReferenceDataTopics')
    expect(types).toContain('referenceData: BepReferenceData')
  })

  it('generates a named interface per domain from a hyphenated id, and an empty BepReferenceData when there are no domains', async () => {
    const { bep } = baseBep()
    expect(await bep.generateRuntimeTypes()).toContain('export interface BepReferenceData {')

    bep.informationDomains.add([{ id: 'my-domain', name: 'My Domain' }])
    expect(await bep.generateRuntimeTypes()).toContain('export interface BepReferenceDataMyDomain {')
  })

  it('nests children recursively, matching resolve()\'s own uniform shape', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    const wip = bep.referenceData.add([{ informationDomainId: 'cde', key: 'WIP', label: 'WIP' }]).succeeded[0]!
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'Structural', label: 'Structural', parentId: wip.id, data: { code: 'STR' } }])

    const types = await bep.generateRuntimeTypes()
    expect(types).toContain('"WIP": {')
    expect(types).toContain('children: {')
    expect(types).toContain('"Structural": {')
    expect(types).toContain('"code": string')
  })
})

describe('label / description', () => {
  it('rejects a node without a label — required, unlike description', () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    // @ts-expect-error label is required
    const result = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open' }])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/label/)
  })

  it('accepts a node with label and an optional description', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const result = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open', description: 'A topic that has not been addressed yet.' }])
    expect(result.failed).toEqual([])

    const resolved = await bep.informationDomains.resolve('topics')
    expect(resolved['open']).toEqual({ label: 'Open', description: 'A topic that has not been addressed yet.' })
  })
})

describe('referencesEntity() — delete-protection via JSONata AST, not evaluation', () => {
  it('is synchronous and blocks deletion without evaluating the expression', () => {
    const { bep, teamId } = baseBep()
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'owner_ref', label: 'Owner ref', data: { owner: `{{teams[id='${teamId}'].name}}` } }])

    // No await — remove() and the check inside it are fully synchronous.
    const result = bep.teams.remove([teamId])
    expect(result.succeeded).toEqual([])
    expect(result.failed[0]!.error).toMatch(/Referenced by:/)
  })

  it('does not block deletion of an unrelated entity that never appears as a literal in the expression', () => {
    const { bep } = baseBep()
    bep.teams.add([{ id: 'XYZ', name: 'Unrelated Team', isoRole: 'appointed-party' }])
    bep.informationDomains.add([{ id: 'cde', name: 'CDE' }])
    bep.referenceData.add([{ informationDomainId: 'cde', key: 'owner_ref', label: 'Owner ref', data: { owner: "{{teams[id='COO'].name}}" } }])

    // The stored reference is to team "COO" — exact literal match, so
    // deleting an entirely unrelated team ("XYZ") must not be blocked.
    const result = bep.teams.remove(['XYZ'])
    expect(result.succeeded).toEqual(['XYZ'])
  })
})
