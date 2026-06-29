# ADR — Explicit operations: no implicit side effects

## Context

The core library exposes operations that act on distinct parts of a `.bep` file: plan versioning (`commit({ target: 'plan' })`), curated artifact consolidation (`commit({ target: 'reports' })`, `commit({ target: 'memories' })`), and their discard counterparts. Each operation targets a specific area of the archive.

During design, the question arose whether plan commits should also consolidate curated artifact collections as a convenience — ensuring the baseline is always fully up to date after any commit. The same question applies to `discard`, `reset`, and `squash`: should they automatically bring all baselines in sync?

## Decision

**Each operation does exactly what its `target` specifies, and nothing else.**

- `commit({ target: 'plan' })` updates `baseline/bep.json` and `baseline/standards/` only. It does not touch collection baselines.
- `commit({ target: 'reports' })` updates `baseline/reports/index.json` only. It does not bump the plan version.
- `discard({ target: 'plan' })` restores the plan to its last committed baseline. It does not restore collection baselines.
- `discard({ target: 'reports' | 'memories' })` restores the collection to its last consolidated baseline. It does not touch the plan.
- `reset()` and `squash()` are plan-only destructive operations. They reset the plan history and its baseline; they do not touch collection baselines.

If a caller wants to commit both the plan and a collection in a single logical step, they call both operations explicitly.

## Reasoning

Implicit side effects create hidden coupling between areas with different lifecycles. A plan commit may be triggered at any point during authoring; bundling collection consolidation into it would mean collections are consolidated at the same cadence as the plan — which defeats the purpose of independent rhythms (see `baseline-mirror.md`).

More broadly, implicit behaviour makes code harder to reason about: a caller who issues a plan commit should not need to consider what else may change. Surprises compound over time as new operations and new collection types are added.

The cost of explicitness is a second call when both targets need to advance. That cost is low and local; the cost of a hidden side effect is diffuse and accumulates.

## Consequences

- **No gotchas.** Calling `commit({ target: 'plan' })` with pending reports does not implicitly consolidate them. The caller decides when to consolidate each target.
- **Predictable composition.** Multiple explicit calls are easier to read and audit than a single implicit one. The intent is visible at the call site.
- **Future collections follow the same rule.** Any collection added to the `.bep` format gets its own explicit `commit` and `discard` target. It is never folded into another operation's side effects.

## Alternatives discarded

**Auto-consolidate collections on plan commit** — Rejected because it couples two independent lifecycles. A plan commit that triggers no visible side effect on collections today would silently consolidate pending entries in a future session where collections have changes.

**A single `commit()` with no target that commits everything** — Rejected for the same reason: it obscures what changed and when. Callers with partial intent (commit only the plan, or only a specific collection) would have no way to express it.
