# ADR — Schema keys are fully spelled out, never abbreviated

## Context

`src/types/schema.ts` is the single source of truth for every entity in the `.bep` format. It is read directly — not only by human developers, but by LLM agents operating through the MCP server, which reason over raw JSON keys and often work against `.bep` data (history diffs, raw entity objects) with no `.describe()` metadata attached, since that semantic layer belongs to the consuming layer, not to core.

This raises the question of how verbose a field name should be. Shorter keys reduce typing and file size; longer, fully-spelled-out keys are unambiguous without external documentation.

## Decision

**Every key in the schema spells out full words, with no abbreviations — regardless of length.**

Examples: `responsibleRoleIds`, `accountableRoleIds`, `consultedRoleIds`, `informedRoleIds` (RACI on `FlowNode`), `objectiveIds`, `milestoneIds`, `disciplineId` — never `respRoleIds`, `objIds`, `discId`, etc.

## Reasoning

The schema may be consumed by several independent layers that share no common glossary. A key name is the only piece of meaning guaranteed to travel with the data everywhere it goes — descriptions, comments, and docs may or may not be present depending on the layer, but the key itself always is.

This is especially important for LLM agents: they frequently reason over raw entity objects (e.g. diffing two versions of a `FlowNode` in a changelog) without any accompanying description. An abbreviated key like `respRIds` forces a guess or a lookup; `responsibleRoleIds` is legible on its own.

## Alternatives discarded

**Abbreviated keys** (`respIds`, `accIds`) — more compact, common convention in many codebases. Rejected because the schema is read far more often than typed by hand — most authoring happens through the MCP by an LLM, not manual JSON editing — so the typing-cost savings are negligible next to the recurring legibility cost.

**Short codes + external glossary doc** — rejected because it breaks self-containment: reading the schema (or a raw `.bep` file) would require cross-referencing a separate document just to know what a key means, which defeats the purpose of the key existing at all.

## Consequences

- Some field names are long (`consultedRoleIds`, `responsibleRoleIds`). This is an accepted tradeoff, not an oversight.
- Any new entity or field added to `schema.ts` must follow the same convention — no abbreviating under time pressure or to "clean up" a long line.
- Key names describe **what** the field is, never **how** a specific consumer uses it — that stays out of core.
