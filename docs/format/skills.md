# skills/

The `skills/` directory defines **LLM behavior for specific contexts**. It is set by the BEP author at project start and is stable and prescriptive throughout the project.

## Structure

```
skills/
└── {skill-name}/
    ├── SKILL.md
    └── resources/
        └── {filename}
```

Each skill has a name (e.g. `bep-authoring`) and contains:

- **`SKILL.md`** — Instructions for the LLM when operating in this skill's context. Describes how to write standards, criteria for workflows, editorial restrictions, project conventions, naming rules, etc.
- **`resources/`** (optional) — Supporting files referenced by `SKILL.md`: templates, reference documents, examples.

## Versioning

Skills are **not versioned**. Like `memory.md`, they live outside the diff chain and are always in their latest state.

## Distinction from `memory.md`

| | `SKILL.md` | `memory.md` |
|-|------------|-------------|
| Content | How to act in a given context | What has happened in the project |
| Authored by | BEP author | LLM (proactively) |
| Stability | Stable; set at project start | Grows over time |
| Scope | Prescriptive instructions | Historical record |
