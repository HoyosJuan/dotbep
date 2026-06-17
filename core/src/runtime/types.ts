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

// ─── Transition log ───────────────────────────────────────────────────────────

/** Immutable log entry written after each successful transition. */
export interface TransitionEvent {
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

// ─── Workflow instance ────────────────────────────────────────────────────────

export interface WorkflowInstance {
  id: string
  /** ref Workflow.id */
  workflowId: string
  /** BEP version at the time this instance was created — used to load the correct workflow definition. */
  bepVersion: string

  /** The asset this instance is tracking. */
  trackedAsset: {
    /** ref AssetType.id */
    assetTypeId: string
    /**
     * Namespace that identifies where the asset lives.
     * Format: "bep:<entityName>" for BEP-internal entities (e.g. "bep:deliverables"),
     * or "external:<softwareId>" for assets in external systems (e.g. "external:software-acc").
     * The softwareId must match a Software.id declared in the BEP (which cannot contain colons).
     */
    source: string
    /** ID of the asset — ref to the entity within the source. */
    id: string
    label: string
  }

  /** Key of the current FlowNode. Not a decision node — engine auto-traverses those. */
  currentNodeId: string
  status: InstanceStatus
  /** Ordered log of all transitions, oldest first. */
  history: TransitionEvent[]

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

// ─── Instance filter ──────────────────────────────────────────────────────────

export interface InstanceFilter {
  /** ref Workflow.id */
  workflowId?: string
  status?: InstanceStatus
  /** Member.email — returns instances where this actor has a pending RACI action. */
  pendingActionFor?: string
  /** ref AssetType.id */
  trackedAssetTypeId?: string
  /** ID of the asset in the external system. */
  trackedAssetId?: string
}

// ─── Node config ──────────────────────────────────────────────────────────────

/** Role reference with minimal resolved fields. */
export interface RoleRef {
  id: string
  name: string
}

/** Team reference with minimal resolved fields. */
export interface TeamRef {
  id: string
  name: string
}

/**
 * Resolved RACI assignment for one letter (R/A/C/I) at a node.
 * Three levels of specificity: emails > teams+roles > roles.
 */
export interface RaciLevel {
  roles:   RoleRef[]
  teams:   TeamRef[]
  /** Explicit member emails authorized regardless of role or team. */
  emails:  string[]
}

/** Current state of a workflow instance — node, transitions, and RACI. Actor-independent. */
export interface WorkflowStatus {
  currentNode: {
    id: string
    type: string
    label: string
  }

  status: InstanceStatus

  /** All transitions available from the current node. Authorization is enforced at emit() time. */
  transitions: {
    edgeId: string
    label: string
    /** eventId to emit */
    emits: string
    requiredPayload: { key: string; type: string; required: boolean; label?: string }[]
  }[]

  /** RACI assignment for the current node — resolved to roles, teams and emails. */
  raci: {
    responsible: RaciLevel
    accountable:  RaciLevel
    consulted:    RaciLevel
    informed:     RaciLevel
  }

  /** True if the current node is type "end". */
  isTerminal: boolean
}

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
 * Handler for an automation node. Receives the instance and the payload filtered
 * from instance.context according to FlowAutomation.payload. Must return an object
 * with an eventId matching the FlowEvent declared on the outgoing edge, plus any
 * additional payload fields used by guards.
 */
export type AutomationHandler = (
  instance: WorkflowInstance,
  payload:  Record<string, unknown>,
) => Promise<{ eventId: string } & Record<string, unknown>>

/**
 * Handler registered for a specific workflow trigger (keyed by Workflow.id).
 * Receives a raw payload from an external system and returns the trackedAsset
 * that the engine will use to create the workflow instance.
 */
export type TriggerHandler = (
  rawPayload: unknown,
) => Promise<WorkflowInstance['trackedAsset']>

export interface EffectOutcome {
  effectId: string
  fromEdgeId: string
  /** executed = handler ran ok | skipped = no handler registered | failed = handler threw */
  status: 'executed' | 'skipped' | 'failed'
  /** Error message thrown by the handler. Present when status = 'failed'. */
  error?: string
}

/** Public result returned by Runtime.emit(). */
export interface EventResult {
  ok: boolean
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

/** Fires when an effect handler throws or returns status 'failed'. */
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

/** Abstraction over where instances are persisted. */
export interface InstanceStore {
  listInstances(filter?: InstanceFilter): Promise<WorkflowInstance[]>
  getInstance(instanceId: string): Promise<WorkflowInstance | null>
  saveInstance(instance: WorkflowInstance): Promise<void>
  deleteInstance(instanceId: string): Promise<void>
}

