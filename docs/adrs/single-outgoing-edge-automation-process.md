# ADR — `process` nodes get exactly one outgoing edge, same as `automation` already has; all branching goes through a decision node

## Context

`FlowDiagramSchema`'s `superRefine` (`core/src/types/schema.ts`) already enforced this for `automation` nodes:

```ts
if (node.type === 'automation' && outs.length !== 1) {
  ctx.addIssue({ message: `automation node must have exactly one outgoing edge (found ${outs.length}).`, ... })
}
if (node.type === 'decision' && outs.length < 2) {
  ctx.addIssue({ message: `decision node must have at least two outgoing edges (found ${outs.length}).`, ... })
}
```

`process` nodes had no equivalent check. Nothing stopped a `process` node from declaring several outgoing edges, each with a different `triggerEventId` — a human choosing which of several actions to take, with the destination determined implicitly by which `triggerEventId` matched, edge by edge, instead of through an explicit `decision` node reading the process step's own payload.

This asymmetry was never a documented decision — it came up while debating whether `process`'s permissiveness served some purpose (a first pass at this ADR incorrectly assumed `automation` was equally unrestricted, having missed this exact `superRefine` block; it was not).

## Decision

**`process` nodes may have at most one outgoing edge, enforced the same way and in the same place as the existing `automation` rule — inside `FlowDiagramSchema`'s `superRefine`, not `validateDiagram()`.** `decision` nodes are unaffected — they keep requiring at least two guarded outgoing edges, which is their entire purpose.

Any branching need — an automation's output determining what happens next, or a human choosing between actions — is expressed the same way from now on: the automation/process node has its one edge into a `decision` node, and the decision's guarded edges do the branching, exactly as `workflow-design-patterns.md`'s Pattern 2 already describes.

This belongs in the diagram's own Zod `superRefine`, not in `validateDiagram()` (`core/src/entities/workflows.ts`), because it needs nothing outside the diagram itself — just a count of edges grouped by `from`, same as the existing per-node structural rules already in that block (start/end node counts, decision's trigger/guard shape, etc.). `validateDiagram()` is reserved for checks that need the rest of the BEP (id references into `bep.actions`/`bep.roles`/`bep.automations`/etc.) or genuine graph algorithms (reachability, cycle detection) — see that file's own checks for the dividing line. A local edge-count-per-node rule is exactly what the diagram schema's `superRefine` already handles for `automation` and `decision`; `process` was simply the one node type that check never got extended to.

## Reasoning

Every case previously expressible as multiple edges off a `process` node is equally expressible as node → single edge → decision node → guarded edges, with zero loss of expressiveness. What's lost by *not* routing through a decision, when the multi-edge shortcut is used instead:

- **The branch stops being visible as its own thing in the diagram.** With multiple edges directly off the node, the branch point is implicit — spread across N edges, distinguishable only by reading each `triggerEventId`. A decision node makes the branch a real, singular, discoverable point in the graph.
- **Guard-field validation only runs against `decision` nodes.** `validateDiagram()`'s "Guard field validation against predecessor outputs" step checks that every guard's field is actually present in a predecessor's declared output/payload — but it only walks `decision` nodes today. A `process` node with several raw edges gets none of that cross-checking; a typo in one edge's `triggerEventId`, or an event that stopped being emitted, fails silently instead of at authoring time.
- **Node types stop meaning one thing.** `automation` does a thing and continues (already enforced); `process` waits for a human and continues; `decision` evaluates and branches. Letting `process` also branch blurred that division for no expressive gain, since the decision node covers the same ground with better validation.

## On "but couldn't multiple edges mean two things happen at once?"

No — not today, and this ADR does not introduce that either. The engine resolves every incoming event to **exactly one** matched edge (`processEvent` in `core/src/runtime/transitions.ts`); if two outgoing edges from the same node shared a `triggerEventId`, that already fails at runtime as `AMBIGUOUS_TRANSITION`, independent of this ADR. Multiple outgoing edges with *distinct* `triggerEventId`s never ran two branches concurrently either — they let the human pick exactly one, same as a decision does, just without a decision's guarantees. There has never been a working fork/join mechanism hiding behind `process`'s permissiveness, so restricting its edge cardinality removes no capability that actually existed.

If genuine concurrent branching (a node's completion driving more than one path forward at once, with real join semantics) becomes something the platform wants to support, that needs deliberate new modeling — a new node or edge concept with its own validation and runtime semantics — not a loosened cardinality rule on `process` nodes. This ADR takes no position on whether that capability should exist later; it only makes explicit that it does not exist now, so the absence isn't ambiguous.

## Consequences

- `FlowDiagramSchema`'s `superRefine` gains one more per-node rule, symmetric with the existing `automation` one: any `process` node with more than one outgoing edge is a schema-validation error, not a runtime surprise.
- Workflow authors modeling "the human picks between paths" must reach for a `decision` node from the start — matches Pattern 2, now enforced for `process` the same way it already was for `automation`.
- No loss of modeling power: everything expressible via multiple edges off a `process` node remains expressible via a decision node, with the added benefit of guard-field validation.

## Alternatives discarded

**Leave `process` unrestricted while `automation` stays restricted (status quo)** — Rejected: the asymmetry has no rationale behind it — nothing about a human-driven step makes multi-edge branching more sound than an automation-driven one. Nothing caught the drift at authoring time either way.

**Allow multiple outgoing edges as an explicit fork/join primitive** — Rejected for now: no such runtime semantics exist (concurrent instance progress, join conditions, partial-completion states), and building them is a substantially larger engine change than this ADR's scope. If wanted later, it should be its own deliberate design, not inferred from loosening a cardinality check.
