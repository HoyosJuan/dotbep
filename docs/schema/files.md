# Files

Three entities describe the types of files produced and the software used to produce them.

## Extension

A file extension (e.g. `rvt`, `nwc`, `ifc`).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | Extension label |

---

## AssetType

A category of deliverable asset (e.g. Native Model, Coordination Model, Drawing). Asset types link to the extensions that are valid for them.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Code used in deliverable naming. Must comply with the naming convention token pattern |
| `name` | string | Yes | |
| `extensionIds` | string[] | No | `ref Extension.id[]` — valid file formats for this asset type |

---

## Software

A software application used in the project.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | Yes | |
| `version` | string | Yes | Version string (e.g. `"2024"`, `"7.3.1"`) |
| `description` | string | No | |
| `assetTypeIds` | string[] | No | `ref AssetType.id[]` — asset types this software produces |
| `url` | string | No | Product website or download URL |

---

## Relationships

```
AssetType ─── extensionIds ─► Extension[]
Software ──── assetTypeIds ─► AssetType[]
BIMUse ─────── software.ids ─► Software[]
Action ──────── softwareIds ─► Software[]
Deliverable ── assetTypeId ─► AssetType
Deliverable ── extensionIds ► Extension[]
```
