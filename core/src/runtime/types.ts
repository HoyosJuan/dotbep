// Runtime types for dotBEP workflow engine.
// These are separate from the BEP schema (bep.json) — instances live outside
// the plan file and represent the live execution state of each workflow.

// ─── Status ───────────────────────────────────────────────────────────────────

export type InstanceStatus = 'active' | 'completed' | 'suspended' | 'error'

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
  payload: Record<string, unknown>
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
  /** Snapshot of the instance context at the moment of transition. */
  contextSnapshot: Record<string, unknown>
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
    /** ref AssetType.id (= workflow.trackedAssetTypeId) */
    assetTypeId: string
    /** ID of the asset in the external system (e.g. BCF Topic GUID). */
    id: string
    label: string
  }

  /** Key of the current FlowNode. Not a decision node — engine auto-traverses those. */
  currentNodeId: string
  status: InstanceStatus
  /** Accumulated payload from all transitions. Each emit merges into this. */
  context: Record<string, unknown>
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

/** Describes what a specific actor can do from the current node of an instance. */
export interface NodeConfig {
  currentNode: {
    id: string
    type: string
    label: string
  }

  /** Transitions this actor can trigger right now. */
  availableTransitions: {
    edgeId: string
    label: string
    /** eventId to emit */
    emits: string
    requiredPayload: { key: string; type: string; required: boolean }[]
  }[]

  /** Transitions that exist but this actor cannot trigger. */
  blockedTransitions: {
    edgeId: string
    label: string
    reason: 'UNAUTHORIZED' | 'GUARD_UNSATISFIABLE'
    /** What the node requires to authorize this transition. */
    required: RaciLevel
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

// ─── Engine result types ──────────────────────────────────────────────────────

export type ProcessEventError =
  | 'INSTANCE_NOT_ACTIVE'
  | 'NO_MATCHING_EDGE'
  | 'AMBIGUOUS_TRANSITION'
  | 'DECISION_LOOP'

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
 * Handler for an automation node. Receives the instance and the payload filtered
 * from instance.context according to FlowAutomation.payload. Must return an object
 * with an eventId matching the FlowEvent declared on the outgoing edge, plus any
 * additional payload fields used by guards.
 */
export type AutomationHandler = (
  instance: WorkflowInstance,
  payload:  Record<string, unknown>,
) => Promise<{ eventId: string } & Record<string, unknown>>

export interface EffectOutcome {
  effectId: string
  fromEdgeId: string
  /** executed = handler ran ok | skipped = no handler or missing required fields | failed = handler threw */
  status: 'executed' | 'skipped' | 'failed'
  /** Required context fields that were missing. Present when status = 'skipped'. */
  missingFields?: string[]
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

// ─── Storage interface ────────────────────────────────────────────────────────

/** Abstraction over where instances are persisted. */
export interface InstanceStore {
  listInstances(projectId: string, filter?: InstanceFilter): Promise<WorkflowInstance[]>
  getInstance(projectId: string, instanceId: string): Promise<WorkflowInstance | null>
  saveInstance(projectId: string, instance: WorkflowInstance): Promise<void>
  deleteInstance(projectId: string, instanceId: string): Promise<void>
}
