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

### Inline references

A standard's content can embed a live reference inline, among ordinary prose: `{{<JSONata expression>}}` — the same reference grammar used everywhere else in core (see `docs/schema/reference-data.md#live-references`), wrapped in `{{ }}` to mark its boundaries within free-form text. For example: `The lead architect is {{teams[id='ARC'].name}}.`

```typescript
await bep.standards.getResolvedContent(id)
// content with every {{...}} occurrence replaced by its live value —
// plain text, no markup. A reference that doesn't resolve is left as a
// visible "⚠ {error}" marker, never silently dropped, and never rejected
// at write time (see docs/adrs/no-async-write-time-validation.md).
```

`getResolvedContent()` is plain-text convenience (e.g. handing a standard's content to an LLM) — a consumer that needs to render the content and visually distinguish which parts are live references resolves `{{...}}` itself, since by the time `getResolvedContent()` returns, the reference boundaries are gone. See `docs/adrs/standards-inline-bep-refs.md`.

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
