# ADR — Version history via backward-applied inverse diffs

## Context

A `.bep` file accumulates a version history over time. Reconstructing any past version requires either storing a diff per version and replaying it, or storing a full snapshot per version. If diffs are used, they can be computed in one of two directions: **forward** (from the previous version to the next) or **inverse** (from the current state back to the previous version).

The current live state (`bep.json`) is read far more often than any historical version — nearly every operation on a `.bep` (rendering the plan, running the engine, editing an entity) needs "what's the plan right now", not a point in its past.

## Decision

**Each commit stores the inverse diff — the patch from the new current state back to the previous baseline** (`compare(currentBep, baseline)`), not a forward diff from old to new.

Reconstructing an older version (`History.get(version)`) starts from the live current state and applies inverse diffs backward, one per commit, until the target version is reached. The oldest version (the terminus, `diff === null`) is the one case stored as a full snapshot, since there is no prior state to diff against.

## Reasoning

Storing forward diffs would make reading the *current* state — the hottest path — the most expensive operation: reconstructing it would mean replaying every diff from the beginning of history forward. Storing inverse diffs inverts this cost: the current state is always the live `bep.json` itself, with zero reconstruction cost, and only reading a historical version (a comparatively rare operation) pays the cost of applying diffs — proportional to how far back that version is, not to the total history length.

## Alternatives discarded

**Forward diffs** (patch from version N to N+1) — rejected because it penalizes the most frequent read (current state) to optimize the least frequent one (an arbitrary historical version).

**A full snapshot per version** — rejected because it bloats the archive linearly with the number of commits. A `.bep` is a single ZIP archive rewritten in full on every save; storing a complete snapshot per version multiplies that cost with every commit instead of storing a small patch.

## Consequences

- Reading the current state is immediate — no reconstruction, no diff application.
- **`bep.json` always reflects the current state** as a direct consequence of this decision, not an independent design goal.
- Reading a historical version costs one `applyPatch` per commit between the current version and the target — cost scales with distance from current, not from the start of history.
- The oldest version (terminus) is the one exception: it has no inverse diff to apply against (there's nothing before it), so it must be stored as a full snapshot instead.
