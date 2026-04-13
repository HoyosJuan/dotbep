import type { BEP, Member, Team } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { MemberSchema } from '../types/schema.js'
import type { MemberResolved } from '../types/resolved.js'

export class Members extends Entity<Member> {
  constructor(getBep: () => BEP) {
    super(
      () => getBep().members,
      getBep,
      {
        key: 'members',
        idField: 'email',
        schema: MemberSchema,
      },
    )
  }

  listResolved(): MemberResolved[] {
    const bep = this.getBep()
    return bep.members.map(m => {
      const team = bep.teams.find(t => (t.memberEmails ?? []).includes(m.email))
      return {
        ...m,
        role: bep.roles.find(r => r.id === m.roleId) ?? null,
        team: team ? { id: team.id, name: team.name } : null,
        isRepresentative: team?.representativeEmail === m.email,
      }
    })
  }

  addToTeam(items: Array<Member & { teamId: Team['id']; isRepresentative?: boolean }>): {
    succeeded: MemberResolved[]
    failed: { input: unknown; error: string }[]
  } {
    const succeeded: MemberResolved[] = []
    const failed: { input: unknown; error: string }[] = []

    for (const item of items) {
      const bep = this.getBep()
      const team = bep.teams.find(t => t.id === item.teamId)
      if (!team) { failed.push({ input: item, error: `Team not found: ${item.teamId}` }); continue }

      const { teamId, isRepresentative, ...member } = item
      const result = this.add([member])
      if (result.failed.length > 0) { failed.push({ input: item, error: result.failed[0].error }); continue }

      team.memberEmails ??= []
      if (!team.memberEmails.includes(item.email)) team.memberEmails.push(item.email)
      if (isRepresentative) team.representativeEmail = item.email

      const resolved = this.listResolved().find(m => m.email === item.email)!
      succeeded.push(resolved)
    }

    return { succeeded, failed }
  }

  updateInTeam(items: Array<Partial<Member> & { email: Member['email']; teamId?: Team['id']; isRepresentative?: boolean }>): {
    succeeded: Array<{ email: Member['email']; after: MemberResolved }>
    failed: { email: Member['email']; error: string }[]
  } {
    const succeeded: Array<{ email: Member['email']; after: MemberResolved }> = []
    const failed: { email: Member['email']; error: string }[] = []

    for (const item of items) {
      const bep = this.getBep()
      const { teamId, isRepresentative, ...fields } = item

      if (teamId !== undefined && !bep.teams.find(t => t.id === teamId)) {
        failed.push({ email: item.email, error: `Team not found: ${teamId}` }); continue
      }

      const result = this.update([fields])
      if (result.failed.length > 0) { failed.push({ email: item.email, error: result.failed[0].error }); continue }

      if (teamId !== undefined) {
        const newTeam = bep.teams.find(t => t.id === teamId)!
        const oldTeam = bep.teams.find(t => (t.memberEmails ?? []).includes(item.email))
        if (oldTeam && oldTeam.id !== teamId) {
          oldTeam.memberEmails = (oldTeam.memberEmails ?? []).filter(e => e !== item.email)
          if (oldTeam.representativeEmail === item.email) oldTeam.representativeEmail = undefined
        }
        newTeam.memberEmails ??= []
        if (!newTeam.memberEmails.includes(item.email)) newTeam.memberEmails.push(item.email)
      }

      if (isRepresentative !== undefined) {
        const team = bep.teams.find(t => (t.memberEmails ?? []).includes(item.email))
        if (team) team.representativeEmail = isRepresentative ? item.email : (team.representativeEmail === item.email ? undefined : team.representativeEmail)
      }

      const resolved = this.listResolved().find(m => m.email === item.email)!
      succeeded.push({ email: item.email, after: resolved })
    }

    return { succeeded, failed }
  }

  removeFromBep(emails: Member['email'][]): {
    succeeded: MemberResolved[]
    failed: { email: Member['email']; error: string }[]
  } {
    const succeeded: MemberResolved[] = []
    const failed: { email: Member['email']; error: string }[] = []

    for (const email of emails) {
      const bep = this.getBep()
      const snapshot = this.listResolved().find(m => m.email === email)
      if (!snapshot) { failed.push({ email, error: `Not found: ${email}` }); continue }

      // Clean team refs so integrity check doesn't block removal
      for (const t of bep.teams) {
        if (t.memberEmails) t.memberEmails = t.memberEmails.filter(e => e !== email)
        if (t.representativeEmail === email) t.representativeEmail = undefined
      }

      const result = this.remove([email])
      if (result.failed.length > 0) {
        // Restore team refs on failure (e.g. notes blocking)
        if (snapshot.team) {
          const team = bep.teams.find(t => t.id === snapshot.team!.id)
          if (team) {
            team.memberEmails ??= []
            if (!team.memberEmails.includes(email)) team.memberEmails.push(email)
            if (snapshot.isRepresentative) team.representativeEmail = email
          }
        }
        failed.push({ email, error: result.failed[0].error }); continue
      }

      succeeded.push(snapshot)
    }

    return { succeeded, failed }
  }
}
