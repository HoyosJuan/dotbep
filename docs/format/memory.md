# memory.md

`memory.md` is the **collective project memory** of the BEP. It lives at the root of the `.bep` archive, outside the version system.

## Purpose

The file is written and maintained proactively by an LLM. It captures context that is not encoded in the structured data of `bep.json` — things like:

- Decisions made and the reasons behind them
- Why a flag was dismissed
- Client constraints or preferences
- Agreements reached in meetings
- Prior attempts and why they were abandoned

The distinction between `memory.md` and `skills/`:

| | `memory.md` | `skills/` |
|-|-------------|-----------|
| Content | What has happened | How to act |
| Set by | LLM (proactively) | Author (at project start) |
| Changes | Grows over time | Stable and prescriptive |

## Versioning

`memory.md` is **not versioned**. It is always in its latest state and is not included in version diffs. The BEP history does not track changes to this file.

## Format

Plain Markdown. No enforced structure — the LLM writes it in whatever format is most useful for the project context.
