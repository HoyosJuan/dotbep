import { describe, it, expect } from 'vitest'
import * as BEP from '../../src/index.js'

function baseBep() {
  const bep = BEP.Bep.create({ name: 'Standards test', code: 'STD', description: '' })
  const [{ id: teamId }] = bep.teams.add([{ id: 'TM1', name: 'Structural Team', isoRole: 'appointed-party' }]).succeeded
  return { bep, teamId }
}

describe('Standards.getResolvedContent()', () => {
  it('replaces every {{...}} inline reference with its live resolved value, leaving surrounding prose untouched', async () => {
    const { bep, teamId } = baseBep()
    const std = bep.standards.add([{ name: 'Naming Convention', content: `Owned by {{teams[id='${teamId}'].name}}.` }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Owned by Structural Team.')
  })

  it('leaves a visible ⚠ marker for a {{...}} reference that does not resolve, never dropping it silently', async () => {
    const { bep } = baseBep()
    const std = bep.standards.add([{ name: 'Naming Convention', content: "Owned by {{teams[id='ghost'].name}}." }]).succeeded[0]!

    const resolved = await bep.standards.getResolvedContent(std.id)
    expect(resolved).toContain('Owned by ⚠')
    expect(resolved).toContain('did not resolve to a value')
  })

  it('resolves multiple references in the same content independently', async () => {
    const { bep, teamId } = baseBep()
    const std = bep.standards.add([{
      name: 'Naming Convention',
      content: `Team: {{teams[id='${teamId}'].name}}. Role: {{teams[id='${teamId}'].isoRole}}.`,
    }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Team: Structural Team. Role: appointed-party.')
  })

  it('reflects live BEP state on every call, never caching a stale resolution', async () => {
    const { bep, teamId } = baseBep()
    const std = bep.standards.add([{ name: 'Naming Convention', content: `Owned by {{teams[id='${teamId}'].name}}.` }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Owned by Structural Team.')

    bep.teams.update([{ id: teamId, name: 'Renamed Team' }])
    expect(await bep.standards.getResolvedContent(std.id)).toBe('Owned by Renamed Team.')
  })

  it('leaves content without any {{...}} reference completely unchanged', async () => {
    const { bep } = baseBep()
    const std = bep.standards.add([{ name: 'Naming Convention', content: '# Naming Convention\nNo references here.' }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('# Naming Convention\nNo references here.')
  })

  it('resolves a reference whose id is a hyphenated UUID (autoId entities, e.g. referenceData), not just plain alphanumeric ids', async () => {
    const { bep } = baseBep()
    bep.informationDomains.add([{ id: 'topics', name: 'Topics' }])
    const node = bep.referenceData.add([{ informationDomainId: 'topics', key: 'open', label: 'Open' }]).succeeded[0]!
    const std = bep.standards.add([{ name: 'Naming Convention', content: `Status key: {{referenceData[id='${node.id}'].key}}.` }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Status key: open.')
  })

  it('resolves a reference whose id is a member email (contains @ and .), not just plain alphanumeric ids', async () => {
    const { bep } = baseBep()
    const role = bep.roles.add([{ name: 'Architect' }]).succeeded[0]!
    bep.members.add([{ email: 'lead@example.com', name: 'Lead Architect', roleId: role.id }])
    const std = bep.standards.add([{ name: 'Naming Convention', content: "Contact: {{members[email='lead@example.com'].name}}." }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Contact: Lead Architect.')
  })

  it('resolves a singular root field (project), not just array collections', async () => {
    const { bep } = baseBep()
    const std = bep.standards.add([{ name: 'Naming Convention', content: 'Project: {{project.name}}.' }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Project: Standards test.')
  })

  it('projects a field across every item in a collection ({{teams.name}}-style)', async () => {
    const { bep } = baseBep()
    bep.teams.add([{ id: 'TM2', name: 'MEP Team', isoRole: 'appointed-party' }])
    const std = bep.standards.add([{ name: 'Naming Convention', content: 'Teams: {{teams.name}}.' }]).succeeded[0]!

    expect(await bep.standards.getResolvedContent(std.id)).toBe('Teams: ["Structural Team","MEP Team"].')
  })
})
