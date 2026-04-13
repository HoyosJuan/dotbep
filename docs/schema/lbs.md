# LBS & Disciplines

## LBS (Location Breakdown Structure)

The LBS defines the spatial breakdown of the project. Nodes form a tree through self-referencing `lbsNodeIds`.

### LBSNode

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Code used in deliverable naming. Must comply with the naming convention token pattern |
| `name` | string | Yes | |
| `type` | enum | Yes | `"zone"` or `"location"` |
| `description` | string | No | |
| `lbsNodeIds` | string[] | No | `ref LBSNode.id[]` — child nodes. A node cannot reference itself |

### Node types

| Type | Meaning |
|------|---------|
| `zone` | A spatial zone (e.g. Building A, Level 2) |
| `location` | A specific location within a zone |

The naming convention uses `lbsZone` and `lbsLocation` tokens which resolve to the `id` of the node linked to a deliverable.

---

## Discipline

A technical discipline covered in the project (e.g. Structural, MEP, Architecture).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Code used in deliverable naming. Must comply with the naming convention token pattern |
| `name` | string | Yes | |

---

## Relationships

```
LBSNode ──── lbsNodeIds ──► LBSNode[]   (tree structure)
Team ──────── disciplineIds ► Discipline[]
Deliverable ─ disciplineId ─► Discipline
Deliverable ─ lbsNodeId ───► LBSNode
LOIN ─────── disciplineId ─► Discipline
```
