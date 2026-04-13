# Deliverables

A deliverable is a specific file that a team must produce and deliver by a milestone.

## Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `description` | string | No | |
| `disciplineId` | string | Yes | `ref Discipline.id` |
| `assetTypeId` | string | Yes | `ref AssetType.id` |
| `extensionIds` | string[] | No | `ref Extension.id[]` — acceptable file formats. If omitted, any format valid for the asset type is accepted |
| `responsibleId` | string | Yes | `ref Team.id` — the team responsible for producing this deliverable |
| `milestoneId` | string | Yes | `ref Milestone.id` — delivery deadline |
| `dueDate` | ISO date | No | Specific due date if different from the milestone date |
| `lbsNodeId` | string | No | `ref LBSNode.id` — spatial scope of this deliverable |
| `predecessorId` | string | No | `ref Deliverable.id` — deliverable that must be completed before this one. Cannot reference itself |

## Derived outputs

From `deliverables`, the following can be derived without any extra data:

- **File name** — resolved from the naming convention using the deliverable's `disciplineId`, `assetTypeId`, `responsibleId`, and `lbsNodeId`.
- **MIDP (Master Information Delivery Plan)** — all deliverables across all teams, sorted by milestone date.
- **TIDP (Task Information Delivery Plan)** per team — filter `deliverables` by `responsibleId`.
- **Dependency graph** — follow `predecessorId` chains.

## Relationships

```
Deliverable ── disciplineId ─► Discipline
Deliverable ── assetTypeId ──► AssetType
Deliverable ── extensionIds ─► Extension[]
Deliverable ── responsibleId ► Team
Deliverable ── milestoneId ──► Milestone
Deliverable ── lbsNodeId ───► LBSNode
Deliverable ── predecessorId ► Deliverable
```
