# Annotations

## Note

A human-authored comment attached to the BEP. Notes are not tied to a specific entity — they are free-form remarks from a member.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `message` | string | Yes | Note content |
| `memberEmail` | email | Yes | `ref Member.email` — author |
| `createdAt` | ISO datetime | Yes | |

---

## Flag

A machine-generated observation about the BEP. Flags are written by the LLM and surface issues, risks, or informational observations. They are **ephemeral** — they have no lifecycle or resolution state, and are regenerated on each analysis pass.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `entity` | FlagEntityType \| null | Yes | The entity type the flag targets, or `null` for a BEP-level flag |
| `entityId` | string \| null | Yes | The ID of the specific entity, or `null` for BEP-level flags. Must be null if and only if `entity` is null |
| `severity` | FlagSeverity | Yes | See severities below |
| `message` | string | Yes | The observation, written in objective technical language |
| `generatedAt` | ISO datetime | Yes | When the flag was generated |

### Severities

| Severity | Meaning |
|----------|---------|
| `info` | Technical observation with no impact on project execution |
| `warning` | Latent risk that doesn't break the BEP but may materialize. Without attention, it may affect the project later |
| `blocking` | Critical information gap that breaks BEP coherence. Elements depending on this entity become orphaned or ill-defined |

### Targetable entities

Flags can target: `roles`, `members`, `teams`, `phases`, `milestones`, `lbs`, `disciplines`, `extensions`, `assetTypes`, `softwares`, `objectives`, `bimUses`, `actions`, `workflows`, `guides`, `annexes`, `standards`, `lods`, `lois`, `loin`, `deliverables`.

A flag with `entity: null` and `entityId: null` is a BEP-level flag (concerns the document as a whole).

---

## Notes vs Flags

| | Note | Flag |
|-|------|------|
| Author | Human (member) | LLM |
| Lifecycle | Permanent | Ephemeral — regenerated each analysis |
| Target | BEP-wide | Specific entity or BEP-level |
| Purpose | Collaboration comments | Technical observations and issues |
