# dot-bep — Code guide

## ADRs

ADRs in `docs/adrs/` document decisions about the `.bep` format and the core library. They must not reference specific consumers, external systems, or layers outside of core — only the format itself and its internal constraints.

At the start of every session involving core, read all files in `docs/adrs/` before making any decisions or changes.

### `docs/adrs/index.json`

`docs/adrs/index.json` is a `{ path: string, description: string }[]` index of every ADR, meant to be fetched on its own (e.g. hosted on GitHub) so an LLM can discover all past decisions without reading every file.

- **New ADR** — add an entry for it to `index.json` in the same change.
- **Modified ADR** — check whether the change affects what the `description` says; update it if so.

## Structure

This repo root **is** `@dotbep/core` (publishable library). `docs/` holds format and schema documentation (MD).

### Key files

- `src/types/schema.ts` — Zod schemas + inferred TypeScript types (source of truth)
- `src/types/resolved.ts` — resolved types (`RaciMatrix`, `TeamResolved`, `DeliverableResolved`, etc.)
- `src/base/entity.ts` — base `Entity<T>` with bulk CRUD + referential integrity
- `src/base/history.ts` — History class (versioning, diffs, snapshots)
- `src/utils/lbs.ts` — `buildParentMap`, `getRootIds`, `resolveLBSCodes`, `validateLBS`
- `src/utils/nomenclature.ts` — `buildConsecutivoMap`, `getNomenCode`, `buildCodeMap`
- `src/utils/normalize.ts` — `normalizeBep`
- `src/utils/diff.ts` — `diffEntities`, `arrayDefs`, `diffBep`
- `examples/` — exhaustive API usage examples (`npm run example`)

### Root scripts

```bash
npm run build        # build:lib + build:schema
npm run build:lib    # builds the library (dist/)
npm run build:schema # regenerates bep.schema.json
npm run example      # runs all authoring examples in sequence
npm run test         # runs the test suite
```

---

## Rule: running examples

Before executing any file in `examples/`, always follow these steps in order, from the repo root:

1. `npm run build:lib` — the examples import from `../dist/index.js`
2. Type-check the example: `npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck examples/<file>.ts`
3. Fix any type errors before running
4. Execute: `node --experimental-strip-types examples/<file>.ts`

---

## Rule: verifying changes with examples and tests

Any change to existing code in `src/` — no matter how small — must be verified by:

1. Running the examples (`npm run example`, following the steps in "Rule: running examples" above). Confirm every example still runs without errors.
2. Running the test suite (`npm test`). Confirm every test still passes.

When implementing a new feature (not just modifying existing behavior), also decide and state explicitly whether it fits into an existing example (extend it to exercise the new behavior) or needs a new file under `examples/`. Propose which one before writing the feature's code — don't leave this as an afterthought.

The same applies to tests: if the change isn't covered by the existing suite, add new tests under `test/` (or extend an existing one) so the behavior is verified going forward — don't leave new functionality untested.

---

## Rule: schema changes

Any modification to `src/types/schema.ts` requires analyzing the full impact before applying the change, and explicitly stating that impact to the user before writing the code — don't leave it as an afterthought.

### Backward compatibility: new arrays in `bep.json`

When a new array is added to the `BEP` interface, existing BEPs won't have that field. Add it to `normalizeBep` in `src/utils/normalize.ts` with `??=` so consumers don't fail on old files:

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
