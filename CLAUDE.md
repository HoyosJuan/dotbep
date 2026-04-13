# dot-bep — Code guide

## Structure

```
core/    — @dotbep/core (publishable library)
docs/    — format and schema documentation (MD)
```

### Key files in `core/`

- `core/src/types/schema.ts` — Zod schemas + inferred TypeScript types (source of truth)
- `core/src/types/resolved.ts` — resolved types (`RaciMatrix`, `TeamResolved`, `DeliverableResolved`, etc.)
- `core/src/base/entity.ts` — base `Entity<T>` with bulk CRUD + referential integrity
- `core/src/base/history.ts` — History class (versioning, diffs, snapshots)
- `core/src/utils/lbs.ts` — `buildParentMap`, `getRootIds`, `resolveLBSCodes`, `validateLBS`
- `core/src/utils/nomenclature.ts` — `buildConsecutivoMap`, `getNomenCode`, `buildCodeMap`
- `core/src/utils/normalize.ts` — `normalizeBep`
- `core/src/utils/diff.ts` — `diffEntities`, `arrayDefs`, `diffBep`
- `core/src/utils/mermaid.ts` — `flowDiagramToMermaid`
- `core/example.ts` — exhaustive API usage example (`npm run example`)

### Root scripts

```bash
npm run build          # build:core (+ gen schema)
npm run build:core     # core library + regenerates bep.schema.json
npm run publish:core   # publish @dotbep/core to npm
npm run example        # runs all authoring examples in sequence
npm run schema         # regenerates bep.schema.json only
npm run schema:diagram # generates schema ER diagram (schema.html)
```

---

## Rule: schema changes

Any modification to `core/src/types/schema.ts` requires analyzing the full impact before applying the change.

### Backward compatibility: new arrays in `bep.json`

When a new array is added to the `BEP` interface, existing BEPs won't have that field. Add it to `normalizeBep` in `core/src/utils/normalize.ts` with `??=` so consumers don't fail on old files:

```typescript
bep.newArray ??= []
```

### Backward compatibility: new fields on existing entities

When a new field is added to an existing entity interface, add the defensive initialization in `normalizeBep` right after the array's `??=` line:

```typescript
bep.teams ??= []
bep.teams.forEach(t => { t.newField ??= undefined })
```

### `getLabel` in `diffEntities`

`diffEntities` takes a `getLabel` per entity type. Common mistakes when adding new entities:

- `Objective` has `description`, **not `name`** — use `.description`
- `Deliverable` has `description?` (optional), **not `name`** — use `d.description ?? d.id`
- Always verify against `schema.ts` before assuming an entity has `.name`

---

## Versioning — code rules

### `baseline/standards/` sync invariant

`baseline/standards/{id}.md` must always match `standards/{uuid}.md` after any operation that modifies `.md` files. If this breaks, change detection produces false positives and restores incorrect content.

Any operation that writes `standards/{uuid}.md` to a historical state must call `snapshotBaseStandards(zip, targetState)` immediately after, before saving the zip.

### `.md` file snapshots (standards)

`standards/{uuid}.md` files are not JSON — they are managed with copy-on-write snapshots:

- On commit, each file is compared against the latest snapshot in `changelog/standards/{id}/`
- If changed (or no snapshot exists), saved as `changelog/standards/{id}/v{new-version}.md`
- To resolve content at a historical version: find the snapshot with the highest version ≤ target
- If no snapshot ≤ target exists, the current file is returned (assumed unchanged since the start)

### Backward compatibility: BEPs without a changelog

A `.bep` without `changelog.json` should be normalized on load:
1. Current `bep.json` becomes `v0.0`
2. `changelog.json`, `changelog/v0.0.json`, `baseline/bep.json`, `baseline/standards/` are created
3. The zip is rewritten to disk

BEPs with the old format (`base.json` at root, `base-standards/`) must be migrated manually.
