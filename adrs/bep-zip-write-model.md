# ADR — The `.bep` ZIP write model and its implications for data inclusion

## Context

A `.bep` file is a ZIP archive. Every write operation — however small the change — requires decompressing the full archive in memory, modifying the target entry, and recompressing the whole file. The cost of each write is therefore proportional to the total size of the archive, not to the size of the change.

This is acceptable for data that changes infrequently. It becomes a structural problem for data with high write frequency or that requires random access to individual entries, where the overhead per operation grows with the number of entries in the archive.

Workflow execution instances are the motivating example: each event transition updates an individual instance, instances are accessed and written independently of one another, and a single project may accumulate thousands of them over its lifetime.

## Decision

Data with high write frequency or that requires random access to individual entries does not belong in the `.bep` for operational use. It lives outside the file, managed by whatever layer consumes it.

However, the same data may be included in the `.bep` as an **archival record** — a point-in-time snapshot that is immutable after inclusion. In that form it satisfies the curated artifact criteria defined in `bep-data-categories` and follows the same structural convention: a named folder at the ZIP root, an `index.json` inside, and one file per entry when the entry has body content.

The distinction is one of role, not of data type:

| Role | Location | Mutability |
|---|---|---|
| Operational | Outside the `.bep` | Updated on every change |
| Archival record | Inside the `.bep` | Immutable after inclusion |

## Reasoning

The ZIP rewrite model is not a limitation to work around — it is a direct consequence of the format's primary strength: a single, portable, self-contained file. Accepting that constraint honestly means being explicit about which data patterns it supports and which it does not.

Treating high-frequency operational data as a category-2 artifact (curated, immutable) would require snapshotting it on every write to avoid stale data in the archive — which defeats the purpose and reintroduces the write cost. The cleaner boundary is to keep such data outside the `.bep` entirely for operational purposes, and allow inclusion only when the intent is explicitly archival.

## Consequences

- Any new data proposed for inclusion in the `.bep` must be assessed against its write frequency and access pattern before being accepted as a format-level addition.
- Archival snapshots of operational data are valid `.bep` content and are treated as curated artifacts per `bep-data-categories`.
- The size of a `.bep` used operationally remains bounded and tractable; archival exports may be larger but are read-only by definition.
