import type { BEP, Discipline, Team } from '../types/schema.js'
import { Entity } from '../base/entity.js'
import { TeamSchema } from '../types/schema.js'
import type { MemberResolved, TeamResolved } from '../types/resolved.js'
import type { Members } from './members.js'
import { validateTokenValue } from '../utils/naming.js'

export class Teams extends Entity<Team> {
  constructor(getBep: () => BEP, private readonly getMembers: () => Members) {
    super(
      () => getBep().teams,
      getBep,
      {
        key: 'teams',
        schema: TeamSchema,
        validate: (team, bep) => {
          const errors: string[] = []
          const tokenErr = validateTokenValue('team', team.id, bep.deliverableNamingConvention)
          if (tokenErr) errors.push(tokenErr)
          if (team.representativeEmail && !(team.memberEmails ?? []).includes(team.representativeEmail))
            errors.push(`representativeEmail "${team.representativeEmail}" is not a member of this team`)
          return errors
        },
        beforeRemove: (id, bep) => {
          if (bep.project.clientId === id)
            throw new Error('Referenced by: project.clientId')
        },
      },
    )
  }

  listResolved(): TeamResolved[] {
    const bep = this.getBep()
    const memberMap = new Map(this.getMembers().listResolved().map(m => [m.email, m]))
    return bep.teams.map(t => ({
      ...t,
      representative: memberMap.get(t.representativeEmail ?? '') ?? null,
      members: (t.memberEmails ?? []).map(email => memberMap.get(email)).filter(Boolean) as MemberResolved[],
      disciplines: (t.disciplineIds ?? []).map(id => bep.disciplines.find(d => d.id === id)).filter(Boolean) as Discipline[],
    }))
  }
}
