// Runtime types for dotBEP workflow engine.
// These are separate from the BEP schema (bep.json) — instances live outside
// the plan file and represent the live execution state of each workflow.

// ─── Status ───────────────────────────────────────────────────────────────────

export type InstanceStatus = 'active' | 'completed' | 'cancelled'

// ─── Incoming event ───────────────────────────────────────────────────────────

/** What a software or user emits to trigger a transition. */
export interface IncomingEvent {
  /** ref FlowEvent.id */
  eventId: string
  /** ref Software.id — identifies which software is emitting. */
  softwareId?: string
  /** Member.email of the person or system acting. */
  actor: string
  /** Key-value payload validated against FlowEvent.payload definition. */
  payload?: Record<string, unknown>
}

// ─── Instance history ─────────────────────────────────────────────────────────
//
// `WorkflowInstance.history` is an ordered log of everything that happened to
// an instance, not only successful transitions. Each entry is discriminated by
// `type` — narrow on it before reading fields specific to one variant (e.g.
// `resolveContext` only folds `trigger.payload` from `TransitionRecord`
// entries, never from the others).

/** A successful transition from one node to another. */
export interface TransitionRecord {
  type: 'transition'
  id: string
  /** ref FlowEdge key */
  edgeId: string
  fromNodeId: string
  toNodeId: string
  /** The event that triggered this transition. */
  trigger: IncomingEvent
  /** Member.email */
  actor: string
  /** ISO 8601 datetime */
  timestamp: string
  /**
   * True when this transition was performed automatically by the engine
   * (e.g. decision node auto-traversal). The actor and trigger fields still
   * reflect the event that caused the automation, not a human action.
   */
  auto?: boolean
  notes?: string
}

/**
 * One execution attempt of an automation node's handler. Written for every
 * attempt, success or failure — the payload passed to the handler is not
 * duplicated here, it is identical to the `trigger.payload` of the
 * `TransitionRecord` that landed on this node.
 */
export interface AutomationAttemptRecord {
  type: 'automationAttempt'
  id: string
  /** ref FlowNode key — the automation node this attempt ran for. */
  nodeId: string
  /** ref FlowAutomation.id */
  automationId: string
  success: boolean
  /** Present when success = false. */
  error?: string
  /** ISO 8601 datetime */
  timestamp: string
}

/**
 * Reserved for a future `revertAutomation` operation that moves an instance
 * back from a failed automation node to the process node that fed it —
 * only ever available when that predecessor is resolvable from `history` for
 * this specific instance. Not produced by the engine yet.
 */
export interface RevertRecord {
  type: 'automationRevert'
  id: string
  /** The automation node being left. */
  fromNodeId: string
  /** The process node being returned to. */
  toNodeId: string
  /** Member.email */
  actor: string
  /** ISO 8601 datetime */
  timestamp: string
}

/**
 * Durable record of a fire-and-forget effect's outcome. `EffectOutcome`
 * itself is still returned from `emit()`/`create()` and passed to
 * `TransitionListener`/`EffectFailedListener` for immediate consumption, but
 * an `EffectExecutionRecord` is always also appended to `history` so the
 * outcome isn't lost once that call returns.
 */
export interface EffectExecutionRecord {
  type: 'effectExecution'
  id: string
  /** ref FlowEffect.id */
  effectId: string
  /** ref FlowEdge key — the edge whose effect this was. */
  fromEdgeId: string
  success: boolean
  /** Present when success = false — no handler registered, or the handler threw. */
  error?: string
  /** ISO 8601 datetime */
  timestamp: string
}

/** An instance being cancelled. Does not imply the caller was authorized — that is the consumer's responsibility, not the engine's. */
export interface CancellationRecord {
  type: 'cancellation'
  id: string
  /** Member.email */
  actor: string
  reason?: string
  /** ISO 8601 datetime */
  timestamp: string
}

/** An attempted transition that the engine refused — no node change occurred. */
export interface TransitionDeniedRecord {
  type: 'transitionDenied'
  id: string
  reason: ProcessEventError
  /** Member.email */
  actor: string
  /** ref FlowEvent.id — the event that was rejected. */
  eventId: string
  /** ISO 8601 datetime */
  timestamp: string
}

export type InstanceHistoryEntry =
  | TransitionRecord
  | AutomationAttemptRecord
  | RevertRecord
  | EffectExecutionRecord
  | CancellationRecord
  | TransitionDeniedRecord

// ─── Workflow instance ────────────────────────────────────────────────────────

export interface WorkflowInstance {
  id: string
  /** ref Workflow.id */
  workflowId: string

  /** The asset this instance is tracking. */
  trackedAsset:
    | { source: 'internal'; type: 'deliverable'; id: string }
    | { source: 'external'; url: string; label: string }

  /** Key of the current FlowNode. Not a decision node — engine auto-traverses those. */
  currentNodeId: string
  status: InstanceStatus
  /** Ordered log of everything that happened to this instance, oldest first. */
  history: InstanceHistoryEntry[]

  /** Set when this instance was spawned by a parent instance. */
  parentInstanceId?: string
  /** FlowNode key in the parent workflow that spawned this instance. */
  parentNodeId?: string

  /** ISO 8601 datetime */
  createdAt: string
  /** ISO 8601 datetime */
  updatedAt: string
  /** Member.email */
  initiatedBy: string
}

// ─── Instance queries ─────────────────────────────────────────────────────────
//
// A small query engine for filtering workflow instances, reusing the same
// field/operator/value vocabulary as `EdgeGuard` (see `applyOperator` in
// transitions.ts) so it reads consistently with the rest of the runtime.
// Conditions are evaluated against an `InstanceQueryProjection`, not the raw
// `WorkflowInstance` — the projection also exposes fields resolved from the
// BEP (the current node's RACI, the workflow's name) that don't live on the
// instance itself.

export type InstanceQueryOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists'

export interface InstanceQueryCondition {
  /** Dot-path into InstanceQueryProjection, e.g. 'status', 'trackedAsset.source', 'raci.responsible.teamIds', 'workflow.name'. */
  field: string
  operator: InstanceQueryOperator
  value?: unknown
}

/** A single condition, or a nested `and`/`or` group of them. */
export type InstanceQuery =
  | InstanceQueryCondition
  | { and: InstanceQuery[] }
  | { or: InstanceQuery[] }

export interface InstanceFilter {
  /** The top-level array is an implicit AND — equivalent to wrapping it in `{ and: [...] }`. */
  where?: InstanceQuery[]
}

/** One side (responsible or accountable) of a resolved RACI assignment, ready to query. */
export interface InstanceQueryRaciLevel {
  roleIds: string[]
  teamIds: string[]
  emails:  string[]
}

/**
 * Per-instance queryable view. Some fields are copied straight from
 * `WorkflowInstance`; others (`workflow`, `raci`) are resolved from the BEP
 * for that instance's current position in its workflow and don't exist on
 * `WorkflowInstance` itself.
 */
export interface InstanceQueryProjection {
  id: string
  workflowId: string
  status: InstanceStatus
  currentNodeId: string
  initiatedBy: string
  createdAt: string
  updatedAt: string
  trackedAsset: WorkflowInstance['trackedAsset']
  /** Absent if the instance's workflow can no longer be found in the BEP. */
  workflow?: { id: string; name: string }
  raci: {
    responsible: InstanceQueryRaciLevel
    accountable: InstanceQueryRaciLevel
    /** True if the current node declares at least one responsible role, team, or email. */
    hasResponsible: boolean
    /** True if the current node declares at least one accountable role, team, or email. */
    hasAccountable: boolean
  }
}

// ─── Workflow status ──────────────────────────────────────────────────────────
//
// A discriminated union, one variant per meaningful state an instance can be
// in — not a flat object with fields that are silently irrelevant depending
// on where the instance happens to be. Deliberately thin: fields the
// consumer could resolve themselves from the BEP given an id (role/team
// names, action details, workflow name) are left as raw ids, not duplicated
// here. Only computed facts that require the engine's own logic (RACI
// resolution, scanning `history` for automation attempts) are included.

interface WorkflowStatusBase {
  instanceId: string
  /** ref Workflow.id */
  workflowId: string
  trackedAsset: WorkflowInstance['trackedAsset']
  /** ref FlowNode key */
  currentNodeId: string
}

/** Parked at a process node — a human action is pending. */
export interface AwaitingActionStatus extends WorkflowStatusBase {
  type: 'awaitingAction'
  /** Transitions available from here. Authorization is enforced at emit() time, not reflected here. */
  transitions: {
    edgeId: string
    /** eventId to emit */
    emits: string
    label?: string
    requiredPayload: { key: string; type: string; required: boolean; label?: string }[]
  }[]
  raci: {
    responsible: InstanceQueryRaciLevel
    accountable: InstanceQueryRaciLevel
    consulted:   InstanceQueryRaciLevel
    informed:    InstanceQueryRaciLevel
  }
}

/** Parked at an automation node. May be executing, or stuck after one or more failed attempts. */
export interface AutomationPendingStatus extends WorkflowStatusBase {
  type: 'automationPending'
  automation: {
    /** ref FlowAutomation.id */
    id: string
    /** Failed attempts recorded since the instance arrived at this node — 0 if none yet. */
    failedAttemptsSinceArrival: number
    /** The most recent failure's error message, if any attempt has failed. */
    lastError?: string
  }
}

/**
 * Parked at a decision node — not a valid resting state. Decision nodes are
 * always auto-traversed within a single `processEvent` call; landing here
 * means no outgoing guard matched the triggering event's payload (see
 * `project_decision_node_silent_stranding`). Surfaced explicitly so a
 * consumer can tell this apart from "nothing pending" instead of it looking
 * like a quiet, valid state.
 */
export interface StrandedStatus extends WorkflowStatusBase {
  type: 'stranded'
}

export interface CompletedStatus extends WorkflowStatusBase {
  type: 'completed'
}

export interface CancelledStatus extends WorkflowStatusBase {
  type: 'cancelled'
}

/** Current state of a workflow instance. Actor-independent. */
export type WorkflowStatus =
  | AwaitingActionStatus
  | AutomationPendingStatus
  | StrandedStatus
  | CompletedStatus
  | CancelledStatus

/** Minimal engine reference available to runtime handlers via this.engine. */
export interface EngineRef {
  workflows: {
    resolveContext(instanceId: string): Promise<Record<string, unknown>>
  }
}

// ─── Engine result types ──────────────────────────────────────────────────────

export type ProcessEventError =
  | 'INSTANCE_NOT_ACTIVE'
  | 'NO_MATCHING_EDGE'
  | 'AMBIGUOUS_TRANSITION'
  | 'DECISION_LOOP'
  | 'UNAUTHORIZED'
  | 'INVALID_PAYLOAD'

export interface PayloadFieldError {
  field: string
  reason: 'missing' | 'wrong_type' | 'unknown_field' | 'invalid_format'
}

export interface TransitionStep {
  edgeId: string
  fromNodeId: string
  toNodeId: string
}

// ─── Effect execution ─────────────────────────────────────────────────────────

/**
 * Handler registered for a specific effectId.
 * Receives the instance and the payload filtered to the keys defined
 * in FlowEffect.payload (resolved from instance.context).
 */
export type EffectHandler = (
  instance: WorkflowInstance,
  payload: Record<string, unknown>,
) => Promise<void>

/**
 * Handler registered for a specific Resolver.id.
 * Fetches and transforms data from an external source, returning a raw payload
 * for the lens to render. Never handles authentication tokens directly —
 * credentials are passed via env.
 */
export type ResolverHandler = (
  url: string,
  env: Record<string, string>,
) => Promise<unknown>

/**
 * Successful outcome of an automation handler — eventId must match the
 * FlowEvent declared on the node's outgoing edge, plus any additional payload
 * fields used by guards further down the diagram.
 */
export type AutomationSuccess = { success: true; eventId: string } & Record<string, unknown>

/**
 * Declared technical failure of an automation handler — a caught error the
 * handler chose to report, not a business-logic outcome. The engine treats
 * this identically to an uncaught exception thrown by the handler: both leave
 * the instance parked at the automation node with an `AutomationAttemptRecord`
 * describing the failure, never silently.
 */
export interface AutomationFailure {
  success: false
  error?: string
}

export type AutomationResult = AutomationSuccess | AutomationFailure

/**
 * Handler for an automation node. Receives the instance and the payload filtered
 * from instance.context according to FlowAutomation.payload. Must resolve to an
 * `AutomationResult` — either `{ success: true, eventId, ...payload }` to
 * advance, matching the FlowEvent on the node's outgoing edge, or
 * `{ success: false, error? }` to report a technical failure. Throwing is
 * also supported and handled the same way as returning `success: false`.
 */
export type AutomationHandler = (
  instance: WorkflowInstance,
  payload:  Record<string, unknown>,
) => Promise<AutomationResult>

/**
 * Handler registered for a specific software trigger (keyed by Software.id).
 * Receives a raw payload from an external system and returns the trackedAsset
 * plus the workflowId the engine will use to create the workflow instance.
 */
export type TriggerHandler = (
  rawPayload: unknown,
) => Promise<{ trackedAsset: WorkflowInstance['trackedAsset']; workflowId: string }>

export interface EffectOutcome {
  effectId: string
  fromEdgeId: string
  success: boolean
  /** Present when success = false — no handler registered, or the handler threw. */
  error?: string
}

/** Public result returned by Runtime.emit(). */
export interface EventResult {
  success: boolean
  instance?: WorkflowInstance
  transitionsApplied?: TransitionStep[]
  effects?: EffectOutcome[]
  error?: ProcessEventError
  /** Present when error = 'INVALID_PAYLOAD'. */
  payloadErrors?: PayloadFieldError[]
}

// ─── Lifecycle listeners ──────────────────────────────────────────────────────

/** Fires after every successful emit() — transitions applied and effects executed. */
export type TransitionListener = (
  instance: WorkflowInstance,
  transitionsApplied: TransitionStep[],
  effects: EffectOutcome[],
) => Promise<void>

/** Fires after createInstance() persists the new instance. */
export type LifecycleListener = (instance: WorkflowInstance) => Promise<void>

/** Fires when an effect has no handler registered, or its handler throws. */
export type EffectFailedListener = (
  instance: WorkflowInstance,
  outcome: EffectOutcome,
) => Promise<void>

/** Fires when an automation handler throws. */
export type AutomationFailedListener = (
  instance: WorkflowInstance,
  automationId: string,
  error: string,
) => Promise<void>

// ─── Storage interface ────────────────────────────────────────────────────────

/**
 * Abstraction over where instances are persisted. `listInstances` takes no
 * filter — filtering by `InstanceFilter.where` requires resolving BEP context
 * (the current node's RACI, the workflow's name) that a storage backend
 * doesn't have, so it happens in `Engine`, not here.
 */
export interface InstanceStore {
  listInstances(): Promise<WorkflowInstance[]>
  getInstance(instanceId: string): Promise<WorkflowInstance | null>
  saveInstance(instance: WorkflowInstance): Promise<void>
  deleteInstance(instanceId: string): Promise<void>
}

