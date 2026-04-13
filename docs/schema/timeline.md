# Timeline

The project timeline is structured around two entities: `phases` and `milestones`.

## Phase

A phase groups a span of work (e.g. Concept Design, Detailed Design, Construction). Phases provide structure but do not carry dates themselves — dates live on milestones.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Phase name |
| `description` | string | No | |

---

## Milestone

A specific checkpoint within a phase, with an associated date. Milestones are the temporal anchor for deliverables, LOIN requirements, and BIM Uses.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Milestone name |
| `date` | ISO date | Yes | Target date (YYYY-MM-DD) |
| `phaseId` | string | Yes | `ref Phase.id` |
| `description` | string | No | |

---

## Relationships

```
Milestone ──── phaseId ────► Phase
Deliverable ── milestoneId ─► Milestone
BIMUse ─────── milestoneIds ► Milestone[]
LOIN ────────── milestones[].milestoneId ► Milestone
```

The MIDP (Master Information Delivery Plan) is derived from all `deliverables`, each linked to a milestone with a date — no separate entity needed.
