# ADR — Runtime handlers get a read-only BEP snapshot, never the authoring API

## Context

`Runtime<T>` handlers (effects, automations, resolvers) currently only have access to `this.env` (env vars) and `this.engine` (`EngineRef`, scoped to `workflows.resolveContext`). There is no way for a handler to read the BEP's own structured plan data — disciplines, teams, members, workflows, etc. — while it runs. That data is only available as static types frozen into the consuming project's `bep.d.ts` at `dotbep pull` time; it cannot be queried live, and it goes stale the moment the plan changes on the platform without a re-pull + redeploy.

The platform already loads the full `BEP` (the plain, schema-typed data — see `flat-id-based-schema.md`) into memory before constructing and initializing the user's `Runtime` (`withBep()` in `platform/functions/src/router.ts`), in the same process, with no sandboxing. The same injection point already used for `this.engine` (`Engine.init()`, `core/src/runtime/Engine.ts`) can be reused to give handlers a reference to that data as `this.bep`.

The open question was what shape to expose: the authoring `Entity` API (`.list()`/`.get()`/`.add()`/`.update()`/`.remove()`, as used by `Bep`'s own consumers), a hand-curated read-only interface mirroring it, or the plain `BEP` type as-is.

## Decision

**`this.bep` is a `structuredClone()` of the plan's plain `BEP` data, typed `Readonly<BEP>`. Runtime handlers never get the authoring `Entity` API.**

- Injected in `Engine.init()`, alongside the existing `_engine` injection, once per request:
  ```ts
  ;(config.runtime as unknown as { _bep?: BEP })._bep = structuredClone(this.getBep())
  ```
- `Runtime.bep` is typed `Readonly<BEP>` — the existing `BEP` type from `core/src/types/schema.ts`, not a new parallel interface.
- No `BepRef`, no `Entity` instances, no `.add()`/`.update()`/`.remove()` reachable from a handler. Reads go through plain array/object access (`this.bep.disciplines.find(...)`), same as any other in-memory data.

## Reasoning

**The plan must not be modifiable from inside a handler.** A runtime handler reacts to workflow events; authoring the plan is the platform's job, done through its own explicit, auditable operations (`commit`/`discard`/`reset`/`squash` — see `explicit-operations.md`). Handing a handler the same mutation surface used for authoring would let plan edits happen as an invisible side effect of workflow execution, with no commit, no version bump, no audit trail — the opposite of everything `bep-data-categories.md` and `inverse-diff-history.md` establish about how plan changes are supposed to happen.

**`structuredClone` over `Object.freeze`.** `BEP` is confirmed plain, primitive-valued data — no `Date`, `Buffer`, `Map`, or `Set` in `schema.ts` (timestamps are ISO strings, consistent with `WorkflowInstance`), so `structuredClone` never fails in the expected case. A shallow `Object.freeze` on the live object would only block reassigning `this.bep.disciplines` itself, not mutating `this.bep.disciplines[0].name` — a deep-freeze would need to be applied recursively to close that gap. `structuredClone` closes it for free: the handler gets a fully detached copy, so mutating it has no effect on the plan, full stop, without any recursive freeze logic to write or maintain. As a side benefit, if a future schema change ever introduces a non-cloneable value, `structuredClone` throws loudly at the exact injection point instead of failing silently.

**Reuse `BEP`, don't hand-maintain a parallel type.** `BEP` is already the schema's single source of truth. Typing `this.bep` as `Readonly<BEP>` means it is permanently in sync with `schema.ts` at zero maintenance cost — no `BepRef` to update every time an entity gains a field. `Readonly<BEP>` is a compile-time-only signal (TypeScript's `Readonly<T>` is shallow and erased at runtime), but the real enforcement is the `structuredClone`, not the type — the type exists only to tell whoever writes a handler "this is not the way to change the plan" at the call site.

## Consequences

- Handlers can read plan data live — e.g. resolving a discipline by id to decide something at execution time — without needing a `dotbep pull` + redeploy for every plan change.
- Zero parallel type to maintain: `this.bep` is `Readonly<BEP>`, generated from the same `schema.ts` used everywhere else in `@dotbep/core`.
- One `structuredClone()` per request, in `Engine.init()`. Negligible relative to the BEP load `withBep()` already performs before that point.
- Mutating `this.bep` inside a handler is a silent no-op on the actual plan — it only ever affects the handler's own detached copy. This is standard JS mutation-of-a-copy semantics, not a new failure mode, but worth remembering: a handler that tries to "update" `this.bep` will not get an error, it will just not work.
- `standards` content (markdown bodies) is not included — `BEP`'s plain data only carries `contentPath` references into the `.bep` zip, not the zip's contents. Acceptable: runtime handlers have little use for full standards text, and nothing here prevents adding a separate, explicit read path later if that changes.
- No batch not-found reporting (`Entity.get()`'s `{succeeded, failed}`) — handlers needing that write their own `.find()`/`.filter()`. Judged an acceptable simplicity trade-off; nothing stops adding read-only convenience helpers later without touching the mutation question this ADR settles.

## Alternatives discarded

**Expose the `Entity`/`Bep` authoring API directly (`.list()`/`.get()`/`.add()`/`.update()`/`.remove()`)** — Rejected outright: this is the one thing the decision above exists to prevent. It would let a handler mutate the live plan mid-event with no commit, no version, no audit trail.

**A hand-curated `BepRef` interface, read-only by construction (mirroring `EngineRef`)** — Considered first, since `EngineRef` already sets that precedent. Rejected because, once mutation is off the table via `structuredClone`, a parallel interface adds a second type to keep in sync with `schema.ts` for no remaining safety benefit — `Readonly<BEP>` gets the same "don't mutate this" signal from a type that already exists and already tracks the schema.

**`Object.freeze()` on the live (non-cloned) object** — Rejected in favor of `structuredClone`: freeze is shallow by default, a recursive deep-freeze would need to be written and kept correct as `BEP`'s shape grows, and even a correct deep-freeze still leaves the handler holding a reference into the exact object the engine is using for the current request — one dependency-injection change away from an accidental leak. A clone has no such edge.
