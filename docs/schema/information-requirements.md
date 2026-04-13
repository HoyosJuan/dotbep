# Information Requirements (LOIN)

The Level of Information Need (LOIN) specifies what geometric and non-geometric information each model element must contain at each milestone.

## LOD (Level of Detail / Development)

Defines the geometric precision of a model element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique code (e.g. `"LOD100"`, `"LOD300"`) |
| `name` | string | Yes | Display name |
| `checklist` | string[] | No | List of geometric criteria that must be met |

---

## LOI (Level of Information)

Defines the non-geometric (property) richness of a model element.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique code (e.g. `"LOI1"`, `"LOI3"`) |
| `name` | string | Yes | Display name |
| `checklist` | string[] | No | List of property/data criteria that must be met |

---

## LOIN

A LOIN entry specifies the required LOD and LOI for a specific element type (by discipline and element description) at one or more milestones.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `element` | string | Yes | Description of the element type (e.g. `"Structural Columns"`) |
| `disciplineId` | string | Yes | `ref Discipline.id` |
| `milestones` | LOINMilestone[] | No | LOIN requirements per milestone |

### LOINMilestone

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `milestoneId` | string | Yes | `ref Milestone.id` |
| `lodId` | string | Yes | `ref LOD.id` |
| `loiId` | string | Yes | `ref LOI.id` |
| `idsPath` | string | No | Path to the `.ids` file inside the `.bep` archive (IDS = Information Delivery Specification) |

---

## Relationships

```
LOIN ─── disciplineId ────────► Discipline
LOIN ─── milestones[].milestoneId ► Milestone
LOIN ─── milestones[].lodId ──► LOD
LOIN ─── milestones[].loiId ──► LOI
```

The `idsPath` field links to an IDS file stored in the `ids/` folder of the `.bep` archive, which can be used to validate model elements against the specified information requirements.
