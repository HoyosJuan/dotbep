# Standards & Guides

## Standard

A project standard is a document written in Markdown that sets rules, conventions, or requirements for BIM work on the project (e.g. modelling standards, naming rules, coordinate systems).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `description` | string | No | Short summary of what the standard covers |
| `contentPath` | string | Yes | Relative path to the `.md` file inside the `.bep` archive (e.g. `standards/{uuid}.md`) |

The actual content lives in the `.md` file referenced by `contentPath`. The `Standard` entry in `bep.json` is just the metadata.

Standards are versioned separately from the rest of `bep.json`. See [Format: Versioning](../format/versioning.md) for how `.md` snapshots are stored in `changelog/standards/`.

---

## Guide

A guide groups one or more annexes (supporting materials) into a named reference resource. Guides can be linked from workflow `Action` entries.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `description` | string | No | |
| `annexIds` | string[] | No | `ref Annex.id[]` |

---

## Annex

An individual supporting file or URL linked to a guide.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `type` | enum | Yes | `"document"` or `"video"` |
| `url` | string | Yes | URL or path to the resource |
| `description` | string | No | |

---

## Relationships

```
Guide ──── annexIds ──────► Annex[]
Action ─── guideIds ──────► Guide[]
```
