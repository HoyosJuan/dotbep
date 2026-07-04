# ADR — Flat schema with ID-based references, no nested objects

## Context

A `.bep` file has many entities that relate to each other — a `Team` has members, a `FlowNode`'s RACI assignment points to `Role`s, a `Deliverable` points to a `Discipline`. Any schema modeling this kind of relational data faces a choice: embed the related entity inline (nested objects), or store a reference to it and keep the entity defined once elsewhere.

This choice has direct consequences for the diffing and versioning system (`arrayDefs` in `src/utils/diff.ts`), which registers each entity type as one flat top-level array with a `getId`/`getLabel` pair, and for `fast-json-patch`, which produces the patches applied to `bep.json` on every write.

## Decision

**All relationships between schema entities are expressed via ID references — never by nesting the referenced entity inline.**

An entity is defined exactly once, in its own top-level array (`members`, `teams`, `roles`, etc.). Anything that needs to point to it stores the ID (or an array of IDs), and resolution to the full entity happens at read time by whichever layer needs it.

## Reasoning

- **A single source of truth per entity.** A `Member` referenced by three `Team`s exists once, in `members`. Nesting would duplicate it across every referencing parent, creating copies that can silently diverge.
- **Uniform diffing.** Because every entity type is a flat array, `arrayDefs` can diff all of them the same way — by ID — instead of needing custom recursive diff logic for every nested shape.
- **Simpler patches.** `bep.json` changes are applied via `fast-json-patch`; flat arrays produce small, predictable patches. Deeply nested objects would produce large, deep patches for what is often a one-field change on a shared entity.
- **Referential integrity is enforced once**, centrally, in `Entity<T>` — not re-derived per relationship shape.

## Alternatives discarded

**Nested/embedded entities** (e.g. `Team.members: Member[]` inline) — rejected because it duplicates the same entity across every parent that references it, risks divergent copies after a partial update, and would force diffing logic to recurse into arbitrary nesting depths instead of comparing flat arrays by ID.

**Denormalized, resolved views stored in the schema itself** (a pre-joined `Team` with full `Member` objects baked in) — rejected because it conflates authored data with derived data; resolved views (`RaciMatrix`, `TeamResolved`, etc.) already exist as a separate, explicit layer (`src/types/resolved.ts`) computed on demand, not persisted.

## Consequences

- Consumers resolve IDs to entities themselves — core does not ship pre-joined views in `bep.json`.
- Any new relationship added to the schema must be an ID or ID array, never a nested object, to stay diffable by `arrayDefs`.
- Referential integrity (an ID pointing to a missing entity) is a class of bug that must be caught by `Entity<T>`'s CRUD layer, not assumed away by the schema shape.
