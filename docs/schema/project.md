# Project

`project` is the root object that identifies the BEP and the construction project it covers. It is not an array — every BEP has exactly one `project`.

## Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Full project name |
| `code` | string | Yes | Short code used in deliverable naming. Must comply with the naming convention token pattern |
| `clientId` | string | No | `ref Team.id` — the team acting as the appointing party / client |
| `description` | string | No | Brief description of what the project is about |
| `image` | string | No | URL or path to a project image |
| `websiteUrl` | string (URL) | No | Project website |

## Notes

- `project.code` appears as the `project` token in the deliverable naming convention. It must be short, uppercase, and match whatever pattern the convention defines (e.g. `PRJ01`).
- `project.clientId` links to a `Team` entry. That team is typically the one with `isoRole: "appointing-party"`.
- `project.description` is the human-readable answer to "what is this document about?" — it should be concise and written for someone unfamiliar with the project.
