# Versioning

## Version scheme

Versions use a two-number format: `{major}.{minor}` (e.g. `0.0`, `0.4`, `1.0`, `2.3`). No full semver.

| Operation | Result | Approvers required |
|-----------|--------|--------------------|
| `commit_patch` | `1.3 → 1.4` (increments minor) | No |
| `commit_version` | `1.3 → 2.0` (increments major, resets minor to 0) | Yes — `approvedBy: string[]` |

Every new BEP starts at `v0.0`. Versions `0.x` and `1.x` are work-in-progress; `1.0`, `2.0`, etc. are official deliveries.

## Diff model

**Inverse diffs** are used: each version file stores how to go *back* to the previous state, not how to reach the next one.

```
bep.json (v1.3)  →  apply v1.3.diff  →  v1.2
v1.2             →  apply v1.2.diff  →  v1.1
v1.1             →  apply v1.1.diff  →  v1.0
v1.0             →  apply v1.0.diff  →  v0.x
...              →  apply v0.1.diff  →  v0.0  (load changelog/v0.0.json)
```

Reading the current version is trivial — it is always `bep.json`. Older versions are reconstructed by applying diffs backwards.

Diff files follow RFC 6902 (JSON Patch). Each is stored at `changelog/v{version}.diff.json` (except `v0.0`, which is a full snapshot at `changelog/v0.0.json`).

## `changelog.json`

Tracks all versions in order. Each entry in `versions[]` includes:

| Field | Description |
|-------|-------------|
| `version` | Version string, e.g. `"1.3"` |
| `type` | `"patch"` or `"version"` |
| `date` | ISO datetime |
| `author` | `Member.email` of the committer |
| `description` | Human-readable summary of changes |
| `diff` | Relative path to the inverse diff file, or `null` for `v0.0` |
| `approvedBy` | (`version` type only) Array of `Member.email` who approved |

## `baseline/`

`baseline/bep.json` is a full JSON snapshot of the **previous committed version**. On each new commit:

```
inverseDiff = compare(bep.json, baseline/bep.json)
              → "how to go from the new version back to the previous one"
```

This avoids reconstructing history to generate the diff.

After the commit, `baseline/bep.json` is overwritten with the new `bep.json`.

## Standards versioning (`.md` files)

`standards/{uuid}.md` files are not JSON and cannot be diffed with RFC 6902. They are managed with **copy-on-write snapshots**:

- On commit, each `standards/{uuid}.md` is compared against the latest snapshot in `changelog/standards/{id}/`.
- If it changed (or no prior snapshot exists), a new snapshot is saved as `changelog/standards/{id}/v{new-version}.md`.
- To resolve a standard's content at a historical version: find the snapshot with the highest version ≤ target version.
- If no snapshot ≤ target version exists, the file is assumed unchanged since the beginning and the current file is returned.

`baseline/standards/{id}.md` is updated on every commit alongside `baseline/bep.json`.
