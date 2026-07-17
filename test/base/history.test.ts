import { describe, it, expect } from 'vitest'
import * as BEP from '../../src/index.js'

const AUTHOR = 'alice@arc.com'

function baseBep() {
  return BEP.Bep.create({ name: 'History test', code: 'HIS', description: '' })
}

/** A BEP with one member (AUTHOR) — needed for version commits and approvedBy checks. */
function bepWithMember() {
  const bep = baseBep()
  const [{ id: roleId }] = bep.roles.add([{ name: 'Tester' }]).succeeded
  bep.members.add([{ email: AUTHOR, name: 'Alice', roleId }])
  return bep
}

async function commitPatch(bep: BEP.Bep, description = 'patch') {
  return bep.history.commit({ target: 'plan', type: 'patch', author: AUTHOR, description })
}

// ─── current / list ─────────────────────────────────────────────────────────────

describe('History — current / list', () => {
  it('current() is "0.0" and list() is empty before any commit', async () => {
    const bep = baseBep()
    expect(await bep.history.current()).toBe('0.0')
    expect(await bep.history.list()).toEqual([])
  })

  it('current() and list() reflect commits as they happen', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'first')
    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'second')

    expect(await bep.history.current()).toBe('0.2')
    expect((await bep.history.list()).map(v => v.version)).toEqual(['0.1', '0.2'])
  })
})

// ─── commit — plan ───────────────────────────────────────────────────────────────

describe('History — commit (plan)', () => {
  it('bumps the minor version for patch commits', async () => {
    const bep = bepWithMember()
    const v1 = await commitPatch(bep)
    expect(v1.version).toBe('0.1')
    expect(v1.type).toBe('patch')

    bep.phases.add([{ name: 'Design' }])
    const v2 = await commitPatch(bep)
    expect(v2.version).toBe('0.2')
  })

  it('bumps the major version and resets minor for version commits', async () => {
    const bep = bepWithMember()
    bep.phases.add([{ name: 'Design' }])

    const v = await bep.history.commit({
      target: 'plan', type: 'version', author: AUTHOR, description: 'release', approvedBy: [AUTHOR],
    })
    expect(v.version).toBe('1.0')
    expect(v.type).toBe('version')

    bep.phases.add([{ name: 'Construction' }])
    const v2 = await commitPatch(bep)
    expect(v2.version).toBe('1.1')
  })

  it('throws if a version commit approver is not a BEP member', async () => {
    const bep = bepWithMember()
    bep.phases.add([{ name: 'Design' }])

    await expect(bep.history.commit({
      target: 'plan', type: 'version', author: AUTHOR, description: 'release', approvedBy: ['ghost@nowhere.com'],
    })).rejects.toThrow(/Members not found/)
  })

  it('throws "No pending plan changes since last commit" when nothing changed', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(commitPatch(bep)).rejects.toThrow('No pending plan changes since last commit')
  })

  it('force:true bypasses the pending-changes check', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    const v = await bep.history.commit({ target: 'plan', type: 'patch', author: AUTHOR, description: 'forced' }, true)
    expect(v.version).toBe('0.2')
  })

  it('detects resolvers and remoteData changes as pending (regression)', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    bep.resolvers.add([{ id: 'my-resolver', name: 'My Resolver', description: 'Fetches stuff.', envKeys: [] }])
    bep.remoteData.add([{ name: 'My Feed', description: 'Live feed.', url: 'https://example.com/data' }])

    const status = await bep.history.status()
    expect(status.hasPendingChanges).toBe(true)
    expect(status.changedKeys).toEqual(expect.arrayContaining(['resolvers', 'remoteData']))

    const v = await commitPatch(bep, 'add resolver + remote data')
    expect(v.version).toBe('0.2')
  })
})

// ─── commit — reports / memories (collection consolidation) ─────────────────────

describe('History — commit (collections)', () => {
  it('consolidating memories does not bump the plan version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    const versionBefore = await bep.history.current()

    bep.memories.add([{
      id: 'note-1', name: 'Note', type: 'realization', links: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      content: 'A realization.',
    }])

    await bep.history.commit({ target: 'memories' })
    expect(await bep.history.current()).toBe(versionBefore)
  })

  it('clears pendingCollections for memories after consolidation', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    bep.memories.add([{
      id: 'note-1', name: 'Note', type: 'realization', links: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      content: 'A realization.',
    }])

    expect((await bep.history.status()).pendingCollections['memories']?.added).toEqual(['note-1'])

    await bep.history.commit({ target: 'memories' })
    expect((await bep.history.status()).pendingCollections['memories']).toBeUndefined()
  })
})

// ─── get ──────────────────────────────────────────────────────────────────────────

describe('History — get', () => {
  it('returns a live clone for the current version (mutating it does not affect the BEP)', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    const state = await bep.history.get('0.1')
    state.project.name = 'Mutated'
    expect(bep.project.get()?.name).not.toBe('Mutated')
  })

  it('reconstructs a historical version via inverse diffs', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')

    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'v0.2 — add Design phase')

    const atV01 = await bep.history.get('0.1')
    expect(atV01.phases.find(p => p.name === 'Design')).toBeUndefined()
    expect(bep.phases.list().find(p => p.name === 'Design')).toBeDefined()
  })

  it('resolves the hidden v0.0 terminus even though it is not in versions[]', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    const atV00 = await bep.history.get('0.0')
    expect(atV00.phases).toEqual([])
  })

  it('throws for an unknown version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(bep.history.get('9.9')).rejects.toThrow(/Version not found/)
  })
})

// ─── compare ────────────────────────────────────────────────────────────────────

describe('History — compare', () => {
  it('produces RFC 6902 ops between two versions', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')
    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'v0.2')

    const { diff } = await bep.history.compare('0.1', '0.2')
    expect(diff.some(op => op.path === '/phases/0')).toBe(true)
  })

  it('reports standards added and content-modified between versions', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')

    const [{ id: stdId }] = bep.standards.add([
      { name: 'Naming', content: '# v1' },
    ]).succeeded
    await commitPatch(bep, 'v0.2 — add standard')

    bep.standards.setContent(stdId, '# v2')
    await commitPatch(bep, 'v0.3 — revise standard')

    const added = await bep.history.compare('0.1', '0.2')
    expect(added.standards.added).toEqual([{ id: stdId, name: 'Naming' }])

    const modified = await bep.history.compare('0.2', '0.3')
    expect(modified.standards.contentModified.map(s => s.id)).toEqual([stdId])
  })
})

// ─── discard ────────────────────────────────────────────────────────────────────

describe('History — discard (plan)', () => {
  it('reverts BEP data changes to the last commit', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    bep.phases.add([{ name: 'Temporary' }])
    expect(await bep.history.hasPendingChanges()).toBe(true)

    await bep.history.discard({ target: 'plan' })
    expect(await bep.history.hasPendingChanges()).toBe(false)
    expect(bep.phases.list().find(p => p.name === 'Temporary')).toBeUndefined()
  })

  it('restores standard content modified since the last commit', async () => {
    const bep = bepWithMember()
    const [{ id: stdId }] = bep.standards.add([{ name: 'Naming', content: '# v1' }]).succeeded
    await commitPatch(bep)

    bep.standards.setContent(stdId, '# WILL BE DISCARDED')
    await bep.history.discard({ target: 'plan' })

    expect(await bep.standards.getContent(stdId)).toBe('# v1')
  })

  it('removes standards added since the last commit', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    const [{ id: stdId }] = bep.standards.add([{ name: 'New standard', content: '# new' }]).succeeded
    await bep.history.discard({ target: 'plan' })

    expect(bep.standards.list().find(s => s.id === stdId)).toBeUndefined()
  })
})

describe('History — discard (collections)', () => {
  it('removes pending memory adds and restores the index to baseline', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)

    bep.memories.add([{
      id: 'note-1', name: 'Note', type: 'realization', links: [],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      content: 'A realization.',
    }])
    await bep.history.commit({ target: 'memories' })

    bep.memories.add([{
      id: 'note-2', name: 'Pending note', type: 'pattern', links: [],
      createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
      content: 'Discarded before consolidation.',
    }])
    expect(bep.memories.list().map(m => m.id)).toEqual(['note-1', 'note-2'])

    await bep.history.discard({ target: 'memories' })
    expect(bep.memories.list().map(m => m.id)).toEqual(['note-1'])
  })
})

// ─── revert ─────────────────────────────────────────────────────────────────────

describe('History — revert', () => {
  it('creates a new version restoring the state of an older version, without deleting intervening ones', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')

    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'v0.2 — add Design phase')

    const reverted = await bep.history.revert('0.1', { type: 'patch', author: AUTHOR, description: 'Revert to v0.1' })
    expect(reverted.version).toBe('0.3')
    expect(bep.phases.list().find(p => p.name === 'Design')).toBeUndefined()

    const versions = (await bep.history.list()).map(v => v.version)
    expect(versions).toEqual(['0.1', '0.2', '0.3'])
  })

  it('restores standard .md content to the target version', async () => {
    const bep = bepWithMember()
    const [{ id: stdId }] = bep.standards.add([{ name: 'Naming', content: '# v1' }]).succeeded
    await commitPatch(bep, 'v0.1')

    bep.standards.setContent(stdId, '# v2')
    await commitPatch(bep, 'v0.2')

    await bep.history.revert('0.1', { type: 'patch', author: AUTHOR, description: 'Revert content' })
    expect(await bep.standards.getContent(stdId)).toBe('# v1')
  })
})

// ─── status / hasPendingChanges ──────────────────────────────────────────────────

describe('History — status', () => {
  it('reports hasPendingChanges: false with no baseline changes', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    expect(await bep.history.hasPendingChanges()).toBe(false)
  })

  it('reports standard status: added, modified (metadata), content-modified, and removed', async () => {
    const bep = bepWithMember()
    const [{ id: keepId }, { id: removeId }] = bep.standards.add([
      { name: 'Kept', content: '# kept' },
      { name: 'To remove', content: '# gone' },
    ]).succeeded
    await commitPatch(bep, 'v0.1')

    bep.standards.setContent(keepId, '# kept — revised')
    bep.standards.update([{ id: keepId, description: 'now has a description' }])
    bep.standards.remove([removeId])
    const [{ id: newId }] = bep.standards.add([{ name: 'Brand new', content: '# new' }]).succeeded

    const status = await bep.history.status()
    const byId = new Map(status.standards.map(s => [s.id, s.status]))
    expect(byId.get(keepId)).toBe('modified') // JSON (description) changed takes precedence over content-modified
    expect(byId.get(removeId)).toBe('removed')
    expect(byId.get(newId)).toBe('added')
  })

  it('reports content-modified when only the .md text changes (no metadata change)', async () => {
    const bep = bepWithMember()
    const [{ id: stdId }] = bep.standards.add([{ name: 'Naming', content: '# v1' }]).succeeded
    await commitPatch(bep)

    bep.standards.setContent(stdId, '# v2')

    const status = await bep.history.status()
    expect(status.standards).toEqual([{ id: stdId, name: 'Naming', status: 'content-modified' }])
  })
})

// ─── listResolved ───────────────────────────────────────────────────────────────

describe('History — listResolved', () => {
  it('resolves author and approvedBy to { email, name }, and flags isCurrent', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')
    bep.phases.add([{ name: 'Design' }])
    await bep.history.commit({ target: 'plan', type: 'version', author: AUTHOR, description: 'release', approvedBy: [AUTHOR] })

    const resolved = await bep.history.listResolved()
    expect(resolved.map(v => v.version)).toEqual(['0.1', '1.0'])

    const patch = resolved.find(v => v.version === '0.1')!
    expect(patch.author).toEqual({ email: AUTHOR, name: 'Alice' })
    expect(patch.isCurrent).toBe(false)

    const version = resolved.find(v => v.version === '1.0')!
    expect(version.isCurrent).toBe(true)
    expect(version.approvedBy).toEqual([{ email: AUTHOR, name: 'Alice' }])
  })

  it('resolves author/approvedBy name as null when the member no longer exists', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    bep.members.remove([AUTHOR])

    const resolved = await bep.history.listResolved()
    expect(resolved[0].author).toEqual({ email: AUTHOR, name: null })
  })
})

// ─── getStandardContent ──────────────────────────────────────────────────────────

describe('History — getStandardContent', () => {
  it('resolves content as of a historical version', async () => {
    const bep = bepWithMember()
    const [{ id: stdId }] = bep.standards.add([{ name: 'Naming', content: '# v1' }]).succeeded
    await commitPatch(bep, 'v0.1')

    bep.standards.setContent(stdId, '# v2')
    await commitPatch(bep, 'v0.2')

    expect(await bep.history.getStandardContent(stdId, '0.1')).toBe('# v1')
    expect(await bep.history.getStandardContent(stdId, '0.2')).toBe('# v2')
  })

  it('returns null when the standard did not exist yet at that version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')

    const [{ id: stdId }] = bep.standards.add([{ name: 'New', content: '# new' }]).succeeded
    await commitPatch(bep, 'v0.2')

    expect(await bep.history.getStandardContent(stdId, '0.1')).toBeNull()
  })
})

// ─── reset (destructive) ──────────────────────────────────────────────────────────

describe('History — reset', () => {
  it('throws for an unknown version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(bep.history.reset('9.9')).rejects.toThrow(/Version not found/)
  })

  it('throws when the target is already the current version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(bep.history.reset('0.1')).rejects.toThrow(/Already at version/)
  })

  it('destructively deletes versions after the target and restores that state', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')
    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'v0.2')
    bep.phases.add([{ name: 'Construction' }])
    await commitPatch(bep, 'v0.3')

    await bep.history.reset('0.2')

    expect((await bep.history.list()).map(v => v.version)).toEqual(['0.1', '0.2'])
    expect(await bep.history.current()).toBe('0.2')
    expect(bep.phases.list().map(p => p.name)).toEqual(['Design'])
  })
})

// ─── squash (destructive) ──────────────────────────────────────────────────────────

describe('History — squash', () => {
  it('throws if newBase is not in X.0 format', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(bep.history.squash({
      newBase: '1.5', author: AUTHOR, description: 'squash', approvedBy: [AUTHOR],
    })).rejects.toThrow(/X\.0 format/)
  })

  it('throws if newBase is not greater than the current version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep) // current = 0.1
    await expect(bep.history.squash({
      newBase: '0.0', author: AUTHOR, description: 'squash', approvedBy: [AUTHOR],
    })).rejects.toThrow(/must be greater than current version/)
  })

  it('throws if an approver is not a BEP member', async () => {
    const bep = bepWithMember()
    await commitPatch(bep)
    await expect(bep.history.squash({
      newBase: '2.0', author: AUTHOR, description: 'squash', approvedBy: ['ghost@nowhere.com'],
    })).rejects.toThrow(/Members not found/)
  })

  it('collapses all history into a single new terminus version', async () => {
    const bep = bepWithMember()
    await commitPatch(bep, 'v0.1')
    bep.phases.add([{ name: 'Design' }])
    await commitPatch(bep, 'v0.2')

    const squashed = await bep.history.squash({
      newBase: '2.0', author: AUTHOR, description: 'Clean start', approvedBy: [AUTHOR],
    })

    expect(squashed.version).toBe('2.0')
    expect(squashed.diff).toBeNull()
    expect((await bep.history.list()).map(v => v.version)).toEqual(['2.0'])
    expect(await bep.history.current()).toBe('2.0')

    // get() for the new terminus still works after squash
    const state = await bep.history.get('2.0')
    expect(state.phases.map(p => p.name)).toEqual(['Design'])
  })
})

// ─── persistence round-trip ────────────────────────────────────────────────────────

describe('History — persists across save/open', () => {
  it('keeps changelog, baseline, and standard snapshots after a save/open round-trip', async () => {
    const bep = bepWithMember()
    const [{ id: stdId }] = bep.standards.add([{ name: 'Naming', content: '# v1' }]).succeeded
    await commitPatch(bep, 'v0.1')

    bep.standards.setContent(stdId, '# v2')
    await commitPatch(bep, 'v0.2')

    const reopened = await BEP.Bep.open(await bep.save())

    expect(await reopened.history.current()).toBe('0.2')
    expect((await reopened.history.list()).map(v => v.version)).toEqual(['0.1', '0.2'])
    expect(await reopened.history.getStandardContent(stdId, '0.1')).toBe('# v1')
    expect(await reopened.history.hasPendingChanges()).toBe(false)
  })
})
