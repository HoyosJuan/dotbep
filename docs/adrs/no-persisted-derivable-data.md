# ADR — Derivable data is computed, never persisted in the schema

## Context

The `.bep` schema grows over time as new needs arise. Some of what gets proposed as a new entity or field is, on inspection, data that could instead be computed deterministically from entities and relationships that already exist in the schema.

## Decision

**If a piece of data can be derived deterministically from existing schema entities and their relationships, it must not be added as a persisted field or entity — it is computed on demand instead.**

Examples already governed by this principle:
- **Deliverable naming code** — computed from existing deliverable/discipline/asset-type data (`src/utils/nomenclature.ts`), never stored per deliverable.
- **Responsibility matrix** — computed by crossing `FlowNode` RACI role IDs with `roles`, `members`, and `teams` (`src/types/resolved.ts`), never stored as its own entity.
- **TIDP per team** — computed by filtering `deliverables` by `responsibleId`, not a separate stored list.
- **MIDP** — computed as all deliverables ordered by phase and date, not a separate stored list.
- **ISO 19650 team diagram** — computed as a graph of `teams` by `isoRole`, not stored.
- **Any historical version of the plan** — reconstructed on demand by applying inverse diffs (see `inverse-diff-history`), never stored as a full snapshot per version.

## Reasoning

Persisting data that can be derived creates a second source of truth that must be kept in sync with the data it came from. Every mutation to the underlying entities would then need to also update the derived copy — and any gap in that sync produces silent drift between the two, with no way to tell which one is correct. Since the derivation is deterministic and cheap enough to compute on demand, persisting it buys nothing but that risk.

## Alternatives discarded

**Persist derived data alongside its source, for convenience** — rejected because it turns a stateless computation into a stateful copy that can go stale, for a computation cheap enough to redo on every read.

**Cache derived data with invalidation logic** — rejected because cache invalidation is real, ongoing complexity, introduced to save a computation that isn't expensive enough to need saving in the first place.

## Consequences

- Adding a new entity or field to the schema requires first asking: can this be computed from what already exists? If yes, it belongs in `src/types/resolved.ts` or a utility in `src/utils/`, not in `schema.ts`.
- Resolved/derived views (`RaciMatrix`, `TeamResolved`, `DeliverableResolved`, etc.) are a distinct, explicit layer, computed on demand — never persisted in `bep.json`.
- This is a standing check applied to every future schema proposal, not a one-time cleanup.
