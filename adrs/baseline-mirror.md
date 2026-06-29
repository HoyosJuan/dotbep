# ADR — `baseline/` as a full structural mirror of the `.bep` root

## Context

A `.bep` file is a ZIP archive whose contents fall into two distinct categories with different lifecycles:

- **Plan data** (`bep.json`, `standards/`) — the structured project definition, subject to explicit versioning via commits (minor/major). Changes are tracked against a committed baseline.
- **Curated artifact collections** (`reports/`, `memories/`, and any future additions) — data that is authored independently of the plan lifecycle. These are not versioned, but they accumulate over time and have a notion of consolidated vs. pending state.

Today, `baseline/` contains `bep.json` and `baseline/standards/` as mirrors of their root counterparts at the last commit. This allows the core to detect pending plan changes by comparing the working copy against the baseline.

Curated artifact collections currently have no equivalent baseline. Without it, there is no format-level mechanism to distinguish an entry that is new and pending consolidation from one that was already consolidated at a prior point. That distinction must be inferred from outside the file, which couples state knowledge to whichever layer opened it.

## Decision

**`baseline/` must always be a full structural mirror of the `.bep` root** for any collection that has a lifecycle distinct from the plan.

Concretely:
- `baseline/reports/index.json` mirrors `reports/index.json` at the last consolidation point.
- `baseline/memories/index.json` mirrors `memories/index.json` at the last consolidation point.
- Any future collection added to the `.bep` root must have a corresponding entry in `baseline/` from the moment it is introduced.

On every commit, `baseline/` is updated to reflect the full current state of the ZIP — plan and curated artifact collections alike.

## Reasoning

`baseline/` already serves as the committed snapshot for the plan. Extending it to cover the entire ZIP root makes the invariant uniform and self-evident: **if something lives in the `.bep` root, its consolidated state lives in `baseline/`**. No special-casing per collection type.

This is structurally analogous to how git tracks state: the working tree is the current state, HEAD is the committed state, and the difference between them is what is pending. A `.bep` file opened by any consumer can answer "what is pending consolidation?" by comparing any collection against its baseline counterpart — without relying on external state.

This gives the core a single, consistent mechanism for answering "what changed since the last commit?" for any part of the file, regardless of whether that part is versioned or not.

## Consequences

- **Consolidation state is self-contained.** An entry in a collection is pending if its ID appears in the collection's `index.json` but not in the corresponding `baseline/` counterpart. A consumer can determine this from the file alone.
- **New collections must opt in.** When a new collection is added to the `.bep` format, its baseline counterpart must be created on first commit and updated on every subsequent one. This is a convention enforced in the core.
- **No change to versioning semantics.** Curated artifact collections are not versioned. The baseline entry for such a collection is not a historical snapshot — it is simply the last consolidated state, overwritten on each commit.

## Alternatives discarded

**Per-entry status flags** — marking individual entries as consolidated or pending within their own `index.json`. Rejected because it mixes authoring state into the data format, requires each collection to implement its own tracking logic, and creates a field that must be kept in sync manually.

**External state comparison** — inferring consolidation state by comparing the file against an outside source. Rejected because it couples state knowledge to the consumer layer and makes the file's state unreadable in isolation.

**Explicit pending list tracked at runtime** — maintaining a list of which entries were created in the current session. Rejected as ad-hoc: it does not survive session restarts and does not generalise to future collection types.
