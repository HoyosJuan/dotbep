# ADR — event payload schemas are a minimum contract, not a closed one; the engine never rejects or strips extra fields

## Context

`validatePayload()` (`core/src/runtime/transitions.ts`) is what runs whenever an edge with a `triggerEventId` is taken:

```ts
function validatePayload(bep: BEP, eventId: string, payload: Record<string, unknown> | undefined): PayloadFieldError[] {
  const def = bep.events.find(e => e.id === eventId)
  if (!def?.payload?.length) return []

  const errors: PayloadFieldError[] = []
  const incoming = payload ?? {}

  for (const field of def.payload) {
    // ...checks the DECLARED fields are present and well-typed...
  }
  // incoming keys not present in def.payload are never inspected
}
```

It iterates the event's *declared* payload fields and checks each is present (if `required`) and well-typed. It never iterates the *incoming* payload's keys. Any field an automation or a human-submitted event includes beyond what the event declares rides through untouched — into the transition record's `trigger.payload`, and from there into `resolveContext()`'s merged view of the instance.

This surfaced as a real question while modeling a workflow: `abrir-hilo-discord-incidencia` (and its sibling `abrir-hilo-discord-avance`) return `{ creado, url_hilo }`, but the event they fire (`hilo-discord-abierto`) declares no payload at all. `url_hilo` still flows correctly into every downstream automation that reads it via `resolveContext()` — the BEP's own event schema is simply silent about the fact that this data exists. Someone auditing the BEP (human or AI) reading `hilo-discord-abierto`'s declared payload would reasonably conclude the event carries nothing, and be wrong.

## Decision

**Leave `validatePayload()` as-is — permissive, minimum-contract semantics. Do not make the engine reject or strip payload fields absent from an event's declared schema.**

An event's declared `payload` exists to guarantee what `decision` node guards, effects, and downstream automations can *rely on being present* — not to exhaustively catalog every field that might ever ride along in a given transition's payload. Declaring a field is a promise ("this will be here, with this type, whenever this event fires"); not declaring one is not a prohibition.

## Reasoning

**Runtime correctness doesn't depend on the event schema in the first place.** Automation authors get their real type safety from `bep.d.ts`'s generated `BepAutomations`/`BepEffects` types (see `runtime-readonly-bep-snapshot.md`), not from the BEP's event definitions — those are TypeScript-checked at the point the handler is written, independent of whatever the corresponding event happens to declare. The event schema is authoring-time documentation and guard-safety, not a runtime data contract for the whole payload.

**A strict engine would turn an authoring oversight into a production failure, or a silent data loss — both worse than the status quo.** Two ways "reject extras" could be implemented, both bad:
- *Hard-reject the transition* — every existing BEP with an automation returning fields its event doesn't declare (which, per the `hilo-discord-abierto` case above, includes BEPs already in production) would start failing transitions the moment this shipped. A breaking change with no deprecation path, punishing exactly the pattern the platform already exhibits in its own reference automations.
- *Silently strip undeclared fields* — worse: an automation author adds a new return field, forgets to update the event's payload schema, and the field just vanishes at runtime with no error at all. Silent data loss is strictly worse than the current "just undocumented" state, because at least today the data still arrives.

**This is a documentation-completeness problem, not a runtime-safety problem — it calls for a lint, not a validator change.** The actual gap is discoverability: nothing today tells a BEP author "this automation's declared `output` has fields your target event's `payload` doesn't mention." That's exactly the shape of problem a non-blocking authoring-time check solves — e.g. `manage_automations`/`manage_workflows` warning (not rejecting) when an automation's `output` and its downstream event's `payload` diverge — without touching `validatePayload()`'s runtime semantics or breaking anything already deployed.

## Consequences

- Event `payload` declarations remain a floor, not a ceiling — required fields are guaranteed present and typed; anything beyond that may or may not be there, and nothing in the schema tells you which without reading the automation/effect code that actually emits the event.
- BEP authors modeling a new automation should still declare every field they intend downstream nodes to rely on — undeclared fields work, but forfeit guard-safety (`validateDiagram()`'s guard-field cross-check only walks declared payload shapes) and the platform's own labeled display of context data.
- The known gap this ADR was written from (`hilo-discord-abierto`/`hilo-discord-abierto`-style events not declaring `url_hilo`) is left as ordinary modeling debt, fixable per-BEP by declaring the field — not something this ADR resolves on its own.

## Alternatives discarded

**Make `validatePayload()` reject unknown fields (closed schema)** — Rejected: breaking change for BEPs already relying on today's behavior (including the platform's own reference automations); moves a documentation gap into a runtime failure mode.

**Silently strip unknown fields before storing the transition** — Rejected: turns a visible-if-you-look problem into invisible data loss. Strictly worse than doing nothing.

**Add strict validation as an opt-in per-event flag** — Considered, not pursued here: plausible future direction (mirrors how Groq's Structured Outputs makes `strict: true` opt-in rather than default), but adds a new schema surface and its own migration questions. Left for a future ADR if the non-blocking lint proves insufficient in practice.
