# BIM Uses & Objectives

## Objective

A high-level project or BIM objective. BIM Uses are the concrete activities that fulfill objectives.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `description` | string | Yes | Statement of the objective |

---

## BIMUse

A specific BIM application or use case on the project (e.g. Clash Detection, 4D Scheduling, Quantity Take-off). Each BIM Use explains *what* will be done and *why*, links to the workflows that implement it, and specifies the software required.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `description` | string | No | |
| `objectiveIds` | string[] | No | `ref Objective.id[]` — which objectives this use fulfills |
| `software` | BIMUseSoftware | No | Software requirements for this use |
| `milestoneIds` | string[] | No | `ref Milestone.id[]` — milestones at which this use is active or delivered |
| `workflowIds` | string[] | No | `ref Workflow.id[]` — workflows that implement this use |

### BIMUseSoftware

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ids` | string[] | Yes | `ref Software.id[]` |
| `description` | string | No | Notes on how the software is used |

---

## Relationships

```
BIMUse ──── objectiveIds ──► Objective[]
BIMUse ──── milestoneIds ──► Milestone[]
BIMUse ──── workflowIds ───► Workflow[]
BIMUse ──── software.ids ──► Software[]
```

The answer to "what will we do and why?" is derived from `bimUses` → `objectiveIds` → `objectives`.
