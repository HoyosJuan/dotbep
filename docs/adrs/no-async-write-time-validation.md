# ADR — `{{...}}` references are not validated at write time

## Context

`referenceData.data` and standards' content can embed a `{{JSONata expression}}` reference, resolved live against the BEP on read (see `docs/adrs/reference-data.md` and `docs/adrs/standards-inline-bep-refs.md`). Actually resolving a reference means evaluating a JSONata expression, and JSONata's `evaluate()` (from version 2.0.0 of the reference implementation onward) always returns a Promise — even for an expression with no async operations at all. There is no synchronous evaluation path.

`Entity.add()`/`Entity.update()`, the base methods every entity's write path goes through, are synchronous by design, and every consumer that calls them today expects a synchronous return. Validating that a `{{...}}` reference actually resolves before accepting a write would require awaiting a JSONata evaluation inside `Entity`'s `validate` hook — which would force `validate`, and in turn `add()`/`update()` themselves, to become async.

## Decision

**A `{{...}}` reference is never validated at write time.** `ReferenceData.add()`/`.update()` (and any other entity holding a field that may contain a reference) accept the write even if the reference's syntax is malformed or it does not currently resolve to anything. The only validation still performed at write time is unrelated to reference resolution: schema shape, sibling-key uniqueness, parentId cycle/cross-domain checks, and so on — none of which require evaluating anything.

A reference that doesn't resolve is only ever discovered on read, replaced with a visible `⚠` marker (see `resolveBepRefs` in `docs/adrs/reference-data.md`) — exactly the same fallback already used for a reference that resolved fine when written but broke later (the referenced entity was renamed or removed). This decision simply widens *when* that marker can first appear: now potentially from the very first read, not only after something changes later.

## Reasoning

**Every consumer of `Entity.add()`/`.update()` calls them synchronously today.** Making them async to support one specific validation would be a breaking change to every entity's write path, not a scoped change to reference handling.

**The read-time fallback already exists and already accepts "a reference can be wrong."** The format never guaranteed a `{{...}}` reference stays valid forever — an entity it points to can be renamed or deleted after the reference was written, and that's already handled by showing `⚠` on resolve instead of failing. Not validating at write time is the same tolerance, just extended to also cover "wrong from the start," not only "wrong from a change made later." It is a difference of *when* the marker can first appear, not a new failure mode the format didn't already have to handle.

**Parsing (to check syntax) is not the same cost as evaluating (to check it resolves).** Confirming a `{{...}}` reference is at least syntactically valid JSONata — or that it plausibly targets a real collection/id — is possible synchronously (JSONata's `.ast()` only parses, never evaluates, and stays synchronous regardless of version). This ADR is specifically about not validating *resolution* (does it currently produce a value), not about validating nothing at all. Whether a lighter, purely-syntactic check is worth adding later is a separate, smaller decision than the one made here.

## Alternatives discarded

**Making `Entity.add()`/`.update()` async across the board.** Solves the problem at its root but is a far larger change than the problem warrants — every entity, every write call site, would need to become async for the sake of one feature's write-time validation.

**Pinning the JSONata dependency to a pre-2.0 version to keep synchronous evaluation.** The 1.8.x line evaluates synchronously, but lacks fixes shipped in 2.x, including a prototype-pollution mitigation — not an acceptable tradeoff for evaluating expressions that can originate from project collaborators, not just trusted authors.

## Consequences

- `ReferenceData.add()`/`.update()` never reject a `{{...}}` reference for failing to resolve — only for unrelated reasons (bad schema shape, sibling-key collision, parentId cycle, etc.).
- `Standards.setContent()` similarly never rejects content for containing a `{{...}}` reference that doesn't resolve.
- `resolveBepRefs` (and anything that calls it — `InformationDomains.resolve()`, `Standards.getResolvedContent()`) is async, and always was for a different reason already (standards' content resolution went through the zip, itself async) — this ADR doesn't introduce async where there was none, it just settles that write-time validation will not be added to force it in.
- `referencesEntity()`, used for delete-protection (blocking removal of an entity a `{{...}}` reference still points to), stays fully synchronous — it only parses a reference's syntax tree to check whether it plausibly targets a given collection/id, it never evaluates it, so it isn't affected by JSONata's async evaluation model at all.
