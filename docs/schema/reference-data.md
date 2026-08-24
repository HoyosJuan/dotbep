# Reference Data

Structured, domain-organized facts meant to be read with certainty by an external integration — a status enum with associated colors, a CDE folder structure, the set of required metadata fields per file — without needing to parse prose to guess at them.

An `InformationDomain` groups related data (e.g. `topics`, `cde`). Each `ReferenceNode` is a single entry within a domain. Nodes form a tree through self-referencing `parentId`, the same pattern LBS uses with `lbsNodeIds` — except reversed (child points to parent, not parent to child) and reconstructed differently; see below.

### InformationDomain

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | |
| `name` | string | Yes | |
| `description` | string | No | What this domain represents — read by external integrations before consuming its data |

### ReferenceNode

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Auto-generated, opaque — never authored by hand |
| `informationDomainId` | string | Yes | `ref InformationDomain.id` |
| `key` | string | Yes | Unique among siblings sharing the same `informationDomainId` + `parentId` — **not** unique globally or even within the whole domain. Used to build the resolved object when a domain is reconstructed |
| `label` | string | Yes | Human-readable identification for this node |
| `description` | string | No | |
| `parentId` | UUID | No | `ref ReferenceNode.id` — omit for a node at the root of its domain. Must belong to a node in the same `informationDomainId`; must not create a cycle |
| `data` | object | No | Free-form attributes. A string value may embed a `{{<JSONata expression>}}` reference, resolved on read — see "Storage vs. resolution" below |

`key` vs `label`: `key` is the technical identifier (constrained, used as an object property name on resolve) — often not fit for display (`in_progress`, `WIP`). `label` carries no uniqueness constraint and is what a human-facing consumer should show.

## Storage vs. resolution

Nodes are always stored **flat** — a tree is never persisted nested (see `no-persisted-derivable-data.md`). To get a domain's data in a usable shape, call:

```typescript
await bep.informationDomains.resolve(domainId)
// → Record<string, { label: string, description?: string, data?: Record<string, unknown>, children?: {...} }>
```

Every node resolves to the same shape, `{ label, description?, data?, children? }`, whether it actually has data, children, both, or neither — predictable for any consumer, no branching on what a given node happens to carry. `{{...}}` references inside `data` are resolved fresh on every call, against the current BEP — never cached, never baked into the stored node. `resolve()` is async because evaluating a live reference always is (see "Live references" below).

A node **can** be saved with a `{{...}}` reference in `data` that does not currently resolve — this is not rejected at write time (see `core/docs/adrs/no-async-write-time-validation.md`); it shows as a visible `⚠` marker instead, only when something actually resolves the node. Deleting an entity (a team, another `ReferenceNode`, anything reachable by a live reference) that some node's `data` still references **is** still blocked, until that node is edited to no longer reference it — this check only has to parse a reference's syntax, never evaluate it, so it stays a write/delete-time check.

`parentId` is validated two more ways: it must belong to a node in the same `informationDomainId` (a cross-domain parent otherwise leaves the child permanently invisible in every domain's `resolve()` output, with no error), and it must not create a cycle with any existing node.

## Live references

A string value in `data` (or embedded in a standard's prose — see `docs/schema/standards.md`) can be `{{<JSONata expression>}}`, evaluated with the raw `BEP` object as its root context — so it reads like real property access:

```typescript
"{{teams[id='COO'].name}}"        // a team's name by id
"{{project.name}}"                // a singular root field, no array lookup needed
"{{teams.name}}"                  // every team's name, projected across the array
```

An expression that doesn't resolve to a value (bad syntax, no matching id, missing field) is replaced with a visible `⚠ {error}` marker wherever it's read — never dropped silently, and never rejected at write time (see `core/docs/adrs/no-async-write-time-validation.md`).

### Resolving without an `Entity` instance

`InformationDomains.resolve(domainId)` requires an `Entity` instance, which a runtime handler doesn't have — `this.bep` inside a handler is a plain `Readonly<BEP>` snapshot. For that case, call the underlying function directly with just a `bep` object:

```typescript
import { resolveInformationDomain } from '@dotbep/core'

await resolveInformationDomain('topics', this.bep)
// same output as await bep.informationDomains.resolve('topics')
```

## Runtime type generation

`await bep.generateRuntimeTypes()` generates a named TypeScript interface per domain (`BepReferenceData<PascalCaseDomainId>`, e.g. `BepReferenceDataTopics`), typed field-by-field from each node's actually-observed `data` — not inferred or normalized across sibling nodes — plus a combined `BepReferenceData` interface keyed by domain id, included in `BepTypes`. Regenerate it whenever `referenceData` changes; it's a snapshot of current contents, not a persisted contract. `generateRuntimeTypes()` is async for the same reason `resolve()` is.

### Example

```json
// informationDomains
[{ "id": "topics", "name": "Topics", "description": "Classification for coordination topics." }]

// referenceData
[
  { "id": "n1", "informationDomainId": "topics", "key": "open", "label": "Open", "data": { "color": "#ef4444" } },
  { "id": "n2", "informationDomainId": "topics", "key": "resolved", "label": "Resolved", "data": { "color": "#10b981" } }
]
```

```typescript
await bep.informationDomains.resolve('topics')
// {
//   open:     { label: 'Open',     data: { color: '#ef4444' } },
//   resolved: { label: 'Resolved', data: { color: '#10b981' } },
// }
```

Full design rationale (why flat storage, why `parentId` instead of LBS's `childIds`-style relation, why `key` uniqueness is per-sibling, why `resolve()` always returns a uniform shape, why live references are JSONata): `core/docs/adrs/reference-data.md`. Why references aren't validated at write time: `core/docs/adrs/no-async-write-time-validation.md`.

## Relationships

```
ReferenceNode ── informationDomainId ──► InformationDomain
ReferenceNode ── parentId ──► ReferenceNode        (tree structure, self-referential)
```
