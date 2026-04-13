# .bep File Structure

A `.bep` file is a **zip archive** with a defined internal layout. It holds the current state, version history, and supporting files for a BIM Execution Plan.

## Archive layout

```
project.bep
├── bep.json                          ← current state (latest version)
├── changelog.json                    ← { current, versions[] }
├── baseline/
│   ├── bep.json                      ← snapshot of the previous committed version
│   └── standards/
│       └── {standard-id}.md          ← baseline of each .md at the time of the last commit
├── changelog/
│   ├── v0.0.json                     ← initial snapshot (terminus of the diff chain)
│   ├── v0.1.diff.json                ← inverse diff: how to go from v0.1 → v0.0
│   ├── v1.0.diff.json                ← inverse diff: how to go from v1.0 → v0.x
│   └── standards/
│       └── {standard-id}/
│           └── v0.3.md               ← .md snapshot when it changed in that version
├── ids/
│   └── {name}.ids
├── ids-reports/
│   └── {name}-report.html
├── standards/
│   └── {uuid}.md
├── guides/
│   └── {name}.pdf
├── memory.md
└── skills/
    └── {skill-name}/
        ├── SKILL.md
        └── resources/
            └── {filename}
```

## Key files

### `bep.json`

The current state of the BEP. Always reflects the latest version — no reconstruction needed.

### `changelog.json`

Tracks the version history: the current version string and an ordered list of version entries, each with author, date, description, and a pointer to its inverse diff file.

### `baseline/`

Reference snapshot of the **last committed state**. Used for two purposes:

- **Change detection** — compare `bep.json` against `baseline/bep.json` to know if there are uncommitted changes.
- **Discard** — restore `bep.json` to `baseline/bep.json` to undo uncommitted edits.

`baseline/standards/{id}.md` mirrors each standard's content at the time of the last commit. Must stay in sync with `standards/{uuid}.md` after every commit — if this invariant breaks, false positives in change detection will occur.

### `standards/{uuid}.md`

Free-form Markdown content for each `Standard` entry. The file is referenced by `Standard.contentPath` in `bep.json`.

### `memory.md`

Collective project memory managed by an LLM. Lives outside the version system — it records decisions, dismissed flags, client constraints, and anything useful for future context. Not versioned; always in its latest state.

### `skills/`

A directory of named skills, each containing a `SKILL.md` and optional `resources/`. Skills define **how the LLM should behave** in a specific context (e.g., authoring standards, analyzing workflows). Set by the BEP author. Distinct from `memory.md`: skills describe *how to act*, memory describes *what has happened*.

### `ids/`

IDS (Information Delivery Specification) files referenced by `LOIN` entries via `LOINMilestone.idsPath`.

### `guides/`

Supporting PDF files for `Guide` and `Annex` entries.
