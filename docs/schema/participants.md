# Participants

Participants are defined through three interconnected entities: `roles`, `members`, and `teams`.

## Role

Defines a functional role in the project (e.g. BIM Manager, BIM Coordinator, Modeller). Roles are used in the RACI matrix of workflow nodes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique identifier |
| `name` | string | Yes | Role name |
| `description` | string | No | What this role does |
| `color` | string (`#RRGGBB`) | No | UI color for visual identification |

---

## Member

A person participating in the project. The `email` field acts as the unique identifier — there is no separate `id`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | email | Yes | Primary key within the project |
| `name` | string | Yes | Full name |
| `roleId` | string | Yes | `ref Role.id` |
| `description` | string | No | Notes about this member |
| `bepEditor` | boolean | No | If `true`, this member can commit versions of the BEP |

---

## Team

A group of members working under a specific ISO 19650 contractual role. Teams are the unit of responsibility in the ISO 19650 team diagram.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Short code used in deliverable naming. Must comply with the naming convention token pattern |
| `name` | string | Yes | Team name |
| `isoRole` | enum | Yes | ISO 19650 role: `appointing-party`, `lead-appointed-party`, or `appointed-party` |
| `description` | string | No | |
| `disciplineIds` | string[] | No | `ref Discipline.id[]` — disciplines this team covers |
| `representativeEmail` | email | No | `ref Member.email` — must be included in `memberEmails` |
| `memberEmails` | email[] | No | `ref Member.email[]` — members belonging to this team |

### Constraint

`representativeEmail` must be one of the emails in `memberEmails`. Validation fails if this is not the case.

---

## Relationships

```
Member ──── roleId ────► Role
Team ─── memberEmails ──► Member[]
Team ─── disciplineIds ─► Discipline[]
Project ── clientId ────► Team
```

The ISO 19650 team diagram can be derived from `teams[].isoRole` — no separate entity needed.

TIDP (Task Information Delivery Plan) per team is derived by filtering `deliverables` where `responsibleId` matches the team ID.
