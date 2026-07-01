# dot-bep — Code guide

## ADRs

ADRs in `core/adrs/` document decisions about the `.bep` format and the core library. They must not reference specific consumers, external systems, or layers outside of core — only the format itself and its internal constraints.

At the start of every session involving core, read all files in `core/adrs/` before making any decisions or changes.

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

## Rule: running examples

Before executing any file in `core/examples/`, always follow these steps in order:

1. `npm run build:core` from the repo root (`core/`) — the examples import from `../dist/index.js`
2. Type-check the example: `npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck examples/<file>.ts` (run from `core/core/`)
3. Fix any type errors before running
4. Execute: `node --experimental-strip-types examples/<file>.ts` (run from `core/core/`)

---

## Rule: verifying changes with examples

Any change to existing code in `core/src/` — no matter how small — must be verified by running the examples (`npm run example`, following the steps in "Rule: running examples" above) before the change is considered done. Confirm every example still runs without errors.

When implementing a new feature (not just modifying existing behavior), also decide and state explicitly whether it fits into an existing example (extend it to exercise the new behavior) or needs a new file under `core/examples/`. Propose which one before writing the feature's code — don't leave this as an afterthought.

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
