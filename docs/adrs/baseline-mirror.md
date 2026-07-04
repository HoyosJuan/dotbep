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

Plan commits update `baseline/bep.json` and `baseline/standards/` only. Curated artifact collections have their own independent consolidation: each collection's baseline is updated only when explicitly requested via `commit({ target: '<collection>' })`. A plan commit never touches collection baselines, and a collection consolidation never bumps the plan version.

## Reasoning

`baseline/` already serves as the committed snapshot for the plan. Extending it to cover the entire ZIP root makes the invariant uniform and self-evident: **if something lives in the `.bep` root, its consolidated state lives in `baseline/`**. No special-casing per collection type.

This is structurally analogous to how git tracks state: the working tree is the current state, HEAD is the committed state, and the difference between them is what is pending. A `.bep` file opened by any consumer can answer "what is pending consolidation?" by comparing any collection against its baseline counterpart — without relying on external state.

This gives the core a single, consistent mechanism for answering "what changed since the last commit?" for any part of the file, regardless of whether that part is versioned or not.

## Consequences

- **Consolidation state is self-contained.** An entry is pending if its ID appears in a collection's `index.json` but not in the corresponding `baseline/` counterpart. A removal is pending if the opposite is true — the ID is in the baseline but no longer in the collection. A consumer can determine both from the file alone.
- **Independent rhythms.** Plan and curated artifact collections each advance at their own pace. A plan commit does not consolidate collections; a collection consolidation does not create a plan version. The two operations are orthogonal.
- **New collections must opt in.** When a new collection is added to the `.bep` format, its baseline counterpart must be initialised on first open and updated only via explicit consolidation. This convention is enforced in the core.
- **No change to versioning semantics.** Curated artifact collections are not versioned. The baseline entry for such a collection is not a historical snapshot — it is the last explicitly consolidated state, overwritten only when consolidation is requested.

## Alternatives discarded

**Per-entry status flags** — marking individual entries as consolidated or pending within their own `index.json`. Rejected because it mixes authoring state into the data format, requires each collection to implement its own tracking logic, and creates a field that must be kept in sync manually.

**External state comparison** — inferring consolidation state by comparing the file against an outside source. Rejected because it couples state knowledge to the consumer layer and makes the file's state unreadable in isolation.

**Explicit pending list tracked at runtime** — maintaining a list of which entries were created in the current session. Rejected as ad-hoc: it does not survive session restarts and does not generalise to future collection types.
