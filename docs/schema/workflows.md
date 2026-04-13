# Workflows

Workflows define the procedural layer of the BEP: the step-by-step processes that govern how BIM work is executed. They are modeled as directed flow graphs.

## Action

A reusable task that can be attached to a process node in a workflow.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `description` | string | No | |
| `softwareIds` | string[] | No | `ref Software.id[]` |
| `guideIds` | string[] | No | `ref Guide.id[]` |

---

## FlowEvent

A named event that can trigger a workflow transition (edge). Events carry a typed payload.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Human-readable slug, e.g. `"status-changed"` |
| `name` | string | Yes | |
| `payload` | FlowPayloadField[] | No | Fields the event carries |

---

## FlowEffect

A side effect fired when a workflow edge is traversed (e.g. send a notification, update an external system).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Human-readable slug, e.g. `"notify"` |
| `name` | string | Yes | |
| `description` | string | No | |
| `payload` | FlowPayloadField[] | No | Fields the effect handler receives |

---

## FlowAutomation

An automated handler attached to `automation` nodes. Unlike a process node (human judgment), an automation runs programmatically and returns typed output.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Human-readable slug, e.g. `"verify-tolerances"` |
| `name` | string | Yes | |
| `description` | string | No | |
| `payload` | FlowPayloadField[] | No | Fields consumed from instance context |
| `output` | FlowPayloadField[] | Yes | Fields the handler must return. Guards on outgoing edges reference these |

---

## FlowPayloadField

Defines a typed field in an event, effect, or automation payload.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Field name |
| `type` | enum | Yes | `"string"`, `"number"`, `"boolean"`, or `"url"` |
| `required` | boolean | Yes | Whether the field must be present |

---

## Workflow

A named flow graph that describes a process from start to end.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | |
| `name` | string | Yes | |
| `description` | string | No | |
| `example` | string | No | Narrative example of the workflow in action |
| `trackedAssetTypeId` | string | No | `ref AssetType.id` — the asset type this workflow operates on |
| `diagram` | FlowDiagram | Yes | The flow graph |

### FlowDiagram

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | enum | Yes | `"LR"` (left-to-right) or `"TB"` (top-to-bottom) |
| `nodes` | Record\<string, FlowNode\> | Yes | Keyed node map |
| `edges` | Record\<string, FlowEdge\> | Yes | Keyed edge map |

---

## FlowNode

A node in the flow diagram. The `type` determines what fields are valid.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | NodeType | Yes | See node types below |
| `label` | string | Only on `decision` | Text label (decision nodes only) |
| `actionId` | string | No | `ref Action.id` — only on `process` nodes |
| `automationId` | string | No | `ref FlowAutomation.id` — required on `automation` nodes |
| `workflowId` | string | No | `ref Workflow.id` — spawns child instances when entered |
| `blocking` | boolean | No | If `true`, waits for all child instances before allowing outgoing transitions. Requires `workflowId` |
| `responsibleRoleIds` | string[] | No | `ref Role.id[]` — RACI: process and decision nodes only |
| `accountableRoleIds` | string[] | No | `ref Role.id[]` |
| `consultedRoleIds` | string[] | No | `ref Role.id[]` |
| `informedRoleIds` | string[] | No | `ref Role.id[]` |
| `responsibleTeamIds` | string[] | No | `ref Team.id[]` — if set alongside `responsibleRoleIds`, actor must satisfy both |
| `accountableTeamIds` | string[] | No | `ref Team.id[]` |
| `consultedTeamIds` | string[] | No | `ref Team.id[]` |
| `informedTeamIds` | string[] | No | `ref Team.id[]` |
| `responsibleEmails` | string[] | No | `ref Member.email[]` — authorizes specific individuals regardless of role or team |
| `accountableEmails` | string[] | No | `ref Member.email[]` |
| `consultedEmails` | string[] | No | `ref Member.email[]` |
| `informedEmails` | string[] | No | `ref Member.email[]` |
| `timeout` | NodeTimeout | No | `process` and `automation` nodes only |

### NodeType

| Type | Semantics | RACI | Trigger to exit |
|------|-----------|------|----------------|
| `start` | Entry point | No | Automatic on instance creation |
| `end` | Terminal node | No | — |
| `process` | Human judgment / manual task | Yes | External event (`triggerEventId`) |
| `decision` | Automatic routing based on rules | No (RACI disallowed by design — system evaluates guards) | Automatic via guards |
| `automation` | Programmatic handler (`automationId`) | No | External event after automation completes |

### NodeTimeout

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hours` | number | Yes | Timeout duration |
| `effectId` | string | Yes | `ref FlowEffect.id` — effect fired when the timeout expires |

---

## FlowEdge

A directed transition between two nodes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Key of the source node |
| `to` | string | Yes | Key of the target node |
| `label` | string | No | Optional display label |
| `triggerEventId` | string | No | `ref FlowEvent.id` — required on edges from `process` and `automation` nodes; forbidden on edges from `start` and `decision` nodes |
| `guard` | EdgeGuard | No | Condition that must be true for this edge to be taken |
| `effectIds` | string[] | No | `ref FlowEffect.id[]` — side effects fired when this edge is traversed |

### EdgeGuard

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | string | Yes | Field name to evaluate (from event payload or instance context) |
| `operator` | enum | Yes | `"eq"`, `"neq"`, `"gt"`, `"lt"`, `"contains"`, `"exists"` |
| `value` | string \| number \| boolean | Conditionally | Required for all operators except `"exists"` |

On `decision` nodes, guards are evaluated automatically against instance context. On `process` nodes, they are evaluated against the event payload at trigger time.

---

## Workflow composition

A `process` node can embed another workflow via `workflowId`. When the node is entered, child instances of the referenced workflow are spawned. If `blocking: true`, the parent instance waits for all children to reach `end` before accepting outgoing transitions.

---

## Derived outputs

From workflows, the following can be derived:

- **Responsibility matrix** — cross `FlowNode` RACI role/team/email IDs with `roles`, `teams`, and `members`
- **Workflow diagrams** — rendered from `diagram.nodes` and `diagram.edges`
