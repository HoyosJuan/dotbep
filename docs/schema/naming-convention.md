# Naming Convention

`deliverableNamingConvention` defines how deliverable file names are automatically constructed. It is optional at the BEP root level but required for name generation to work.

## NamingConvention

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `delimiter` | string | Yes | Separator between segments (e.g. `"-"`, `"_"`) |
| `segments` | NamingSegment[] | Yes | Ordered list of name parts. At most one `sequence` segment allowed |

---

## NamingSegment

A segment is either a **field** (resolved from BEP data) or a **sequence** (auto-incremented number).

### `field` segment

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"field"` | Yes | |
| `token` | NamingToken | Yes | Which BEP field to use |
| `pattern` | string | No | Optional transform pattern applied to the resolved value |

### `sequence` segment

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"sequence"` | Yes | |
| `padding` | integer ≥ 1 | No | Zero-pad the number to this many digits (e.g. `3` → `001`) |

---

## NamingToken

Tokens map to specific BEP entity IDs used as code values in the name:

| Token | Resolved from |
|-------|--------------|
| `project` | `project.code` |
| `team` | `Deliverable.responsibleId` → `Team.id` |
| `discipline` | `Deliverable.disciplineId` → `Discipline.id` |
| `assetType` | `Deliverable.assetTypeId` → `AssetType.id` |
| `lbsZone` | `Deliverable.lbsNodeId` → `LBSNode.id` (type `zone`) |
| `lbsLocation` | `Deliverable.lbsNodeId` → `LBSNode.id` (type `location`) |

The IDs of these entities (`Team.id`, `Discipline.id`, `AssetType.id`, `LBSNode.id`) must follow the token pattern defined in the convention — typically short, uppercase codes.

---

## Example

Convention:
```json
{
  "delimiter": "-",
  "segments": [
    { "type": "field", "token": "project" },
    { "type": "field", "token": "team" },
    { "type": "field", "token": "discipline" },
    { "type": "field", "token": "assetType" },
    { "type": "sequence", "padding": 3 }
  ]
}
```

Result for a deliverable: `PRJ01-ARCH-STR-NWC-001`
