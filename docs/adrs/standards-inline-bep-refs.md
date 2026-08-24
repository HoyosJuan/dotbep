# ADR — `{{...}}` inline references in standard content

## Context

A standard's content is free-form markdown prose — unlike `referenceData.data` (a flat key/value bag where a whole field value can be a `{{JSONata expression}}` reference), a standard's `.md` body needs a reference to sit inline among ordinary text (e.g. "The lead architect is `{{teams[id='ARC'].name}}`.").

## Decision

Inside a standard's markdown content, `{{<JSONata expression>}}` marks an inline reference — the same grammar already used everywhere else in core (`docs/adrs/reference-data.md`), just wrapped in `{{ }}` so it can be distinguished from surrounding prose.

`Standards.getResolvedContent(id)` returns the standard's content with every `{{...}}` occurrence replaced by its resolved value, plain text, no markup:

```typescript
await bep.standards.getResolvedContent(id)
// "The lead architect is Architecture (Lead)."
```

A reference that doesn't resolve is left as a visible `⚠ {error}` marker (the same fallback `resolveBepRefs` already uses elsewhere), never silently dropped.

## Reasoning

**Reused the existing reference grammar, not a new one** — the `{{ }}` wrapper is purely a boundary marker so an inline reference can be told apart from plain text; the JSONata expression itself is identical to what `referenceData.data`, and everything else, already uses. One grammar, one mental model, regardless of where a reference appears.

**`getResolvedContent()` returns plain text, not markup** — it exists for consumers that only want the final resolved text (e.g. handing a standard's content to an LLM, or any plain-text/export use), not for rendering. A consumer that needs to visually distinguish which parts of the content are live references — style them, link them back to the source entity, show a tooltip — can't use this method's output for that: by the time it returns, the `{{ }}` boundaries are gone, replaced inline with the resolved value. That consumer needs to locate `{{...}}` occurrences itself and resolve each one individually. `getResolvedContent()` is a convenience for the plain-text case, not the only way to resolve inline references.

**Resolution happens on read, never persisted** — same as every other live reference in core (`no-persisted-derivable-data.md`): the stored `.md` content always keeps the raw `{{...}}` text; only `getResolvedContent()`'s *return value* has it substituted, computed fresh against the current BEP on every call.

**`resolveBepRefs` handles both the whole-field case and the embedded-in-prose case with one function** — `referenceData.data`'s values are typically *entirely* one reference (`"{{teams[id='COO'].name}}"`, nothing else in the string), while a standard's content has references embedded partway through much longer prose. `resolveBepRefs` distinguishes the two by checking whether the whole string is exactly one `{{...}}`: if so, the expression's own value type is preserved (an object stays an object, not stringified); otherwise, every `{{...}}` occurrence found is replaced in place, stringified. `Standards.getResolvedContent()` is simply `resolveBepRefs(rawContent, bep)` — no separate extraction logic of its own.

## Alternatives discarded

**A dedicated resolution method that returns match positions/spans instead of a substituted string** — considered so a single method could serve both the plain-text and the rendering use case. Rejected: the plain-text case (`getResolvedContent()`) is simple and has a real standalone consumer (anything wanting final text, no markup); a positions-based API would make that simple case carry complexity only the rendering case needs, for no benefit to either.

**A separate resolution function for standards' embedded-in-prose case, distinct from `referenceData.data`'s whole-string case** — this was the original design (`getResolvedContent()` had its own local regex + replace loop, separate from `resolveBepRefs`). Reversed once `resolveBepRefs` itself was extended to detect and handle both shapes — see Reasoning above — since maintaining two parallel implementations of essentially the same substitution logic was pure duplication once one function could do both correctly.

## Consequences

- `{{...}}` in a standard's raw markdown is inert until resolved — `getContent()` returns it untouched, `getResolvedContent()` substitutes it.
- No write-time validation of `{{...}}` references inside standard content — consistent with `referenceData.data`, which also does not validate at write time (`docs/adrs/no-async-write-time-validation.md`). An unresolvable reference simply renders as a visible `⚠` marker on read, in both places, never rejected on save.
- A consumer rendering a standard's content (rather than exporting/handing it to something else as plain text) does not use `getResolvedContent()` — it resolves `{{...}}` itself, since it needs the reference boundaries `getResolvedContent()` deliberately discards.
