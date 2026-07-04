# ADR — The `.bep` file hosts two distinct data categories

## Context

A `.bep` file is a ZIP archive. Its original purpose was to hold a BIM Execution Plan — a structured project definition with explicit versioning, diffs, and rollback. That data (plan schema, standards) is versioned via `changelog/` and `baseline/`.

As the ecosystem evolved, a second kind of data emerged: outputs produced by executing the plan. Examples include point-in-time snapshots of project status or distilled knowledge derived from execution history. These outputs are authored at a specific moment, do not change after creation, and their presence in the file is what makes a `.bep` self-contained as a project record — not just a plan.

This raised a recurring question: does a given piece of data belong inside the `.bep`, and if so, how is it treated?

## Decision

The `.bep` file formally recognises two data categories with different semantics:

**Category 1 — Plan data**
The structured project definition. Mutable with explicit commits. Fully versioned via changelog and baseline. Supports rollback and diff.

**Category 2 — Curated artifacts**
Outputs of executing or analysing the plan. Immutable after authoring — new entries are created rather than editing existing ones. Not versioned. Their role in the file is evidentiary: they contribute to the self-contained traceability of the project record.

The criterion for belonging to category 2 is:
- The data is authored or approved at a specific point in time.
- It does not change after creation.
- Its presence in the file adds durable traceability value independent of any backend system.

Data that does **not** belong in the `.bep` is operational data with high write frequency or unbounded growth, whose access pattern (random reads, incremental updates) is incompatible with the ZIP rewrite model.

## Reasoning

The coexistence of versioned and non-versioned data within the same file is an established pattern in open file formats. Jupyter notebooks (`.ipynb`) store authored code cells alongside execution outputs in the same JSON document — the ecosystem deliberately treats them differently, stripping outputs before version control while preserving the code. Icechunk stores versioned snapshot files alongside immutable data chunks within the same store root. In both cases the distinction is not a compromise but a deliberate design: the two categories have different lifecycles and different consumers.

For `.bep`, the same principle holds. Plan data and curated artifacts have genuinely different lifecycles. Forcing them into the same versioning mechanism would either over-version artifacts (which don't change) or under-version plan data (which requires auditability). Keeping the categories explicit and named makes the model predictable for any future addition to the format.

## Consequences

- Any new data added to the `.bep` format must be explicitly assigned to one of the two categories. If it is category 2, it follows the curated artifact model: append-only, immutable entries, no versioning infrastructure required.
- Category 2 collections follow a structural convention: a named folder at the ZIP root, an `index.json` inside, and one file per entry when the entry has body content. No `baseline/` counterpart is needed unless the collection requires change tracking (which curated artifacts by definition do not).
- The plan versioning machinery (`changelog/`, `baseline/`) is not extended to cover category 2 collections.
- Operational data that does not meet the category 2 criterion lives outside the `.bep` and is managed by the platform layer.
