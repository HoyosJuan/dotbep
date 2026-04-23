import { z } from 'zod'

// ─── Primitives ───────────────────────────────────────────────────────────────

export const ISORole = z.enum([
  'appointing-party',
  'lead-appointed-party',
  'appointed-party',
])
export type ISORole = z.infer<typeof ISORole>

export const AnnexType = z.enum(['video', 'document'])
export type AnnexType = z.infer<typeof AnnexType>

export const LBSNodeType = z.enum(['zone', 'location'])
export type LBSNodeType = z.infer<typeof LBSNodeType>

export const FlowDirection = z.enum(['LR', 'TB'])
export type FlowDirection = z.infer<typeof FlowDirection>

export const NodeType = z.enum(['start', 'end', 'process', 'decision', 'automation'])
export type NodeType = z.infer<typeof NodeType>

export const FlagSeverity = z.enum(['info', 'warning', 'blocking'])
export type FlagSeverity = z.infer<typeof FlagSeverity>


export const FlagEntityType = z.enum([
  'roles',           'members',      'teams',
  'phases',          'milestones',   'lbs',
  'disciplines',     'extensions',   'assetTypes',    'softwares',
  'objectives',      'bimUses',      'actions',       'workflows',
  'guides',          'annexes',      'standards',
  'lods',            'lois',         'loin',
  'deliverables',
])
export type FlagEntityType = z.infer<typeof FlagEntityType>

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1)
    .describe('Must comply with the naming convention token pattern.'),
  clientId: z.string()
    .describe('ref Team.id').optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  websiteUrl: z.url().optional(),
}).describe('General metadata about the construction project the BEP belongs to.')

export type Project = z.infer<typeof ProjectSchema>

// ─── Participants ─────────────────────────────────────────────────────────────

export const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
}).describe('Defines a stakeholder role in the project. Used to assign process responsibilities in workflows and to resolve who must act at each workflow step.')

export type Role = z.infer<typeof RoleSchema>

export const MemberSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  roleId: z.string(),
  description: z.string().optional(),
  bepEditor: z.boolean().optional(),
}).describe('A project participant identified by email. Each member holds one role, which determines their responsibilities across workflow steps.')

export type Member = z.infer<typeof MemberSchema>

export const TeamBaseSchema = z.object({
  id: z.string().min(1)
    .describe('Must comply with the naming convention token pattern.'),
  name: z.string().min(1),
  isoRole: ISORole,
  description: z.string().optional(),
  disciplineIds: z.array(z.string()).optional(),
  representativeEmail: z.email().optional()
    .describe('ref Member.email'),
  memberEmails: z.array(z.email()).optional(),
}).describe('A company or discipline group participating in the project. Teams group members under an ISO role and can be assigned RACI responsibilities at the workflow level.')

export const TeamSchema = TeamBaseSchema
  .refine(t => !t.representativeEmail || (t.memberEmails ?? []).includes(t.representativeEmail), {
    message: 'representativeEmail must be included in memberEmails.',
    path: ['representativeEmail'],
  })

export type Team = z.infer<typeof TeamSchema>

// ─── Naming convention ────────────────────────────────────────────────────────

export const NamingTokenSchema = z.enum([
  'project',
  'team',
  'discipline',
  'assetType',
  'lbsZone',
  'lbsLocation',
])

export type NamingToken = z.infer<typeof NamingTokenSchema>

export const NamingSegmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('field'), token: NamingTokenSchema, pattern: z.string().optional() }),
  z.object({ type: z.literal('sequence'), padding: z.number().int().min(1).optional() }),
])

export type NamingSegment = z.infer<typeof NamingSegmentSchema>

export const NamingConventionSchema = z.object({
  delimiter: z.string().min(1),
  segments:  z.array(NamingSegmentSchema).min(1),
}).describe('A structured rule for generating deliverable names. Specifies a delimiter and a sequence of segments that are joined to produce consistent, parseable file names.')
  .refine(c => c.segments.filter(s => s.type === 'sequence').length <= 1, {
    message: 'segments can contain at most one sequence.',
    path: ['segments'],
  })

export type NamingConvention = z.infer<typeof NamingConventionSchema>

// ─── Project Context ──────────────────────────────────────────────────────────

export const PhaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
}).describe('A project lifecycle stage used to organize milestones and deliverables.')

export type Phase = z.infer<typeof PhaseSchema>

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  date: z.iso.date(),
  phaseId: z.string(),
  description: z.string().optional(),
}).describe('A named deadline within a phase. Anchors deliverables and information requirements to a specific date in the project timeline.')

export type Milestone = z.infer<typeof MilestoneSchema>

export const LBSNodeBaseSchema = z.object({
  id: z.string().min(1)
    .describe('Used in deliverables nomenclature.'),
  name: z.string().min(1),
  type: LBSNodeType,
  description: z.string().optional(),
  lbsNodeIds: z.array(z.string()).optional()
    .describe('ref LBSNode.id[]'),
}).describe('A spatial or functional subdivision of the project. LBS nodes form a hierarchy that scopes deliverables to specific spatial or functional areas.')

export const LBSNodeSchema = LBSNodeBaseSchema
  .refine(n => !(n.lbsNodeIds ?? []).includes(n.id), {
    message: 'A node cannot reference itself in lbsNodeIds.',
    path: ['lbsNodeIds'],
  })

export type LBSNode = z.infer<typeof LBSNodeSchema>

export const DisciplineSchema = z.object({
  id: z.string().min(1)
    .describe('Used in deliverables nomenclature.'),
  name: z.string().min(1),
}).describe('A project discipline used to classify deliverables and information requirements. Represents a technical domain such as structure, architecture, or MEP.')

export type Discipline = z.infer<typeof DisciplineSchema>

// ─── Files ────────────────────────────────────────────────────────────────────

export const ExtensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
}).describe('A file format or extension accepted for deliverables, such as IFC, PDF, or DWG. Used to specify the required output formats per deliverable.')

export type Extension = z.infer<typeof ExtensionSchema>

export const AssetTypeSchema = z.object({
  id: z.string().min(1)
    .describe('Used in deliverables nomenclature.'),
  name: z.string().min(1),
  extensionIds: z.array(z.string()).optional(),
}).describe('A category of digital asset. Identifies the kind of information container — model, drawing, specification, etc. — independently of how it is used in the project.')

export type AssetType = z.infer<typeof AssetTypeSchema>

export const SoftwareSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  assetTypeIds: z.array(z.string()).optional(),
  url: z.string().optional(),
}).describe('A specific software application used by the project team. Linked to the asset types it produces and the BIM uses or actions that rely on it.')

export type Software = z.infer<typeof SoftwareSchema>

// ─── BIM Uses ─────────────────────────────────────────────────────────────────

export const ObjectiveSchema = z.object({
  id: z.uuid(),
  description: z.string().min(1),
}).describe('A stated reason for using BIM on this project. Objectives are the root of the BEP — all BIM uses, workflows, and deliverables must serve at least one.')

export type Objective = z.infer<typeof ObjectiveSchema>

export const BIMUseSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  objectiveIds: z.array(z.string()).optional(),
  milestoneIds: z.array(z.string()).optional(),
  workflowIds: z.array(z.string()).optional(),
}).describe('A specific application of BIM that serves one or more project objectives. Links intent to execution by connecting objectives, workflows, and milestones.')

export type BIMUse = z.infer<typeof BIMUseSchema>

// ─── Actions & Workflows ──────────────────────────────────────────────────────

export const ActionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  softwareIds: z.array(z.string()).optional().describe('ref Software.id[]'),
  guideIds: z.array(z.string()).optional().describe('ref Guide.id[]'),
}).describe('A human-performed activity referenced by workflow process nodes. Actions represent what a person in a given role does at a specific step.')

export type Action = z.infer<typeof ActionSchema>

// ─── Events & Effects (global catalogs) ───────────────────────────────────────

export const FlowPayloadFieldSchema = z.object({
  key:      z.string().min(1),
  type:     z.enum(['string', 'number', 'boolean', 'url']),
  required: z.boolean(),
})

export type FlowPayloadField = z.infer<typeof FlowPayloadFieldSchema>

export const FlowEventSchema = z.object({
  id:      z.string().min(1).describe('Human-readable slug, e.g. "status-changed".'),
  name:    z.string().min(1),
  payload: z.array(FlowPayloadFieldSchema).optional(),
}).describe('A signal that advances a workflow instance from one node to the next. Carries a typed payload that moves the workflow instance forward and can be evaluated by decision guards.')

export type FlowEvent = z.infer<typeof FlowEventSchema>

export const FlowEffectSchema = z.object({
  id:          z.string().min(1).describe('Human-readable slug, e.g. "notify".'),
  name:        z.string().min(1),
  description: z.string().optional(),
  payload:     z.array(FlowPayloadFieldSchema).optional(),
}).describe('A fire-and-forget side effect triggered on a workflow edge. Executed by the runtime when the edge is traversed, using fields from the instance context as payload.')

export type FlowEffect = z.infer<typeof FlowEffectSchema>

export const FlowAutomationSchema = z.object({
  id:          z.string().min(1).describe('Human-readable slug, e.g. "verify-tolerances".'),
  name:        z.string().min(1),
  description: z.string().optional(),
  payload:     z.array(FlowPayloadFieldSchema).optional()
    .describe('Fields consumed from instance context and passed to the handler.'),
  output:      z.array(FlowPayloadFieldSchema)
    .describe('Fields the handler must return. Guards on outgoing edges reference these.'),
}).describe('A system-executed node in a workflow. Runs a handler automatically, produces a typed output, and must be followed by a decision node that branches on that output.')

export type FlowAutomation = z.infer<typeof FlowAutomationSchema>

// ─── Flow graph ───────────────────────────────────────────────────────────────

export const NodeTimeoutSchema = z.object({
  hours:    z.number().positive(),
  effectId: z.string().min(1).describe('ref FlowEffect.id'),
}).describe('A time-based escalation on a process or automation node. Fires a declared effect if the node has not been advanced within the given number of hours.')

export type NodeTimeout = z.infer<typeof NodeTimeoutSchema>

// ── Mixins ──

const RaciMixinSchema = z.object({
  responsibleRoleIds:  z.array(z.string()).optional().describe('ref Role.id[]'),
  accountableRoleIds:  z.array(z.string()).optional().describe('ref Role.id[]'),
  consultedRoleIds:    z.array(z.string()).optional().describe('ref Role.id[]'),
  informedRoleIds:     z.array(z.string()).optional().describe('ref Role.id[]'),
  responsibleTeamIds:  z.array(z.string()).optional().describe('ref Team.id[] — if set alongside responsibleRoleIds, actor must satisfy both.'),
  accountableTeamIds:  z.array(z.string()).optional().describe('ref Team.id[]'),
  consultedTeamIds:    z.array(z.string()).optional().describe('ref Team.id[]'),
  informedTeamIds:     z.array(z.string()).optional().describe('ref Team.id[]'),
  responsibleEmails:   z.array(z.string()).optional().describe('ref Member.email[] — authorizes specific members regardless of role or team.'),
  accountableEmails:   z.array(z.string()).optional().describe('ref Member.email[]'),
  consultedEmails:     z.array(z.string()).optional().describe('ref Member.email[]'),
  informedEmails:      z.array(z.string()).optional().describe('ref Member.email[]'),
})

const TimeoutMixinSchema = z.object({
  timeouts: z.array(NodeTimeoutSchema).optional(),
})

// ── Concrete node schemas ──

export const FlowStartNodeSchema = z.object({
  type: z.literal('start'),
})

export const FlowEndNodeSchema = z.object({
  type: z.literal('end'),
})

export const FlowDecisionNodeSchema = z.object({
  type:  z.literal('decision'),
  label: z.string().min(1),
})

export const FlowAutomationNodeSchema = z.object({
  type:         z.literal('automation'),
  automationId: z.string().min(1).describe('ref FlowAutomation.id'),
}).extend(TimeoutMixinSchema.shape)

export const FlowProcessNodeSchema = z.object({
  type:       z.literal('process'),
  actionId:   z.string().optional().describe('ref Action.id'),
  workflowId: z.string().optional().describe('ref Workflow.id — spawns child instances of this workflow when the node is entered.'),
  blocking:   z.boolean().optional().describe('If true, waits for all spawned child instances to complete before accepting outgoing transitions.'),
}).extend(RaciMixinSchema.shape).extend(TimeoutMixinSchema.shape)
  .refine(n => !!n.actionId !== !!n.workflowId, {
    message: 'process nodes require exactly one of actionId or workflowId.',
    path: ['actionId'],
  })
  .refine(n => !n.blocking || !!n.workflowId, {
    message: 'blocking requires workflowId to be set.',
    path: ['blocking'],
  })
  .refine(n =>
    (n.responsibleRoleIds?.length ?? 0) > 0 ||
    (n.responsibleTeamIds?.length ?? 0) > 0 ||
    (n.responsibleEmails?.length ?? 0) > 0,
    {
      message: 'process nodes require at least one responsible (role, team, or email).',
      path: ['responsibleRoleIds'],
    }
  )

export const FlowNodeSchema = z.union([
  FlowStartNodeSchema,
  FlowEndNodeSchema,
  FlowDecisionNodeSchema,
  FlowAutomationNodeSchema,
  FlowProcessNodeSchema,
]).describe('A node in a workflow diagram used to describe steps.')

export type FlowStartNode      = z.infer<typeof FlowStartNodeSchema>
export type FlowEndNode        = z.infer<typeof FlowEndNodeSchema>
export type FlowDecisionNode   = z.infer<typeof FlowDecisionNodeSchema>
export type FlowAutomationNode = z.infer<typeof FlowAutomationNodeSchema>
export type FlowProcessNode    = z.infer<typeof FlowProcessNodeSchema>
export type FlowNode           = z.infer<typeof FlowNodeSchema>

export const EdgeGuardSchema = z.object({
  field:    z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'exists']),
  value:    z.union([z.string(), z.number(), z.boolean()]).optional(),
})
  .refine(g => g.operator === 'exists' || g.value !== undefined, {
    message: 'value is required when operator is not "exists".',
    path: ['value'],
  })

export type EdgeGuard = z.infer<typeof EdgeGuardSchema>

const FlowEdgeBaseSchema = z.object({
  from:      z.string().describe('ref FlowNode key'),
  to:        z.string().describe('ref FlowNode key'),
  label:     z.string().optional(),
  effectIds: z.array(z.string().min(1)).optional().describe('ref FlowEffect.id[]'),
}).refine(e => e.from !== e.to, {
  message: 'A flow edge cannot point from a node to itself.',
  path: ['to'],
})

export const FlowTransitionEdgeSchema = FlowEdgeBaseSchema.extend({
  triggerEventId: z.string().min(1).describe('ref FlowEvent.id — the event that fires this transition'),
})

export const FlowDecisionEdgeSchema = FlowEdgeBaseSchema.extend({
  guard: EdgeGuardSchema.describe('Condition evaluated against the instance context to determine which path to take.'),
})

// Edges from start/end nodes carry no trigger and no guard — they are structural connectors only.
export const FlowDirectEdgeSchema = FlowEdgeBaseSchema

export const FlowEdgeSchema = z.union([FlowTransitionEdgeSchema, FlowDecisionEdgeSchema, FlowDirectEdgeSchema])

export type FlowTransitionEdge = z.infer<typeof FlowTransitionEdgeSchema>
export type FlowDecisionEdge   = z.infer<typeof FlowDecisionEdgeSchema>
export type FlowDirectEdge     = z.infer<typeof FlowDirectEdgeSchema>
export type FlowEdge           = z.infer<typeof FlowEdgeSchema>

export const FlowDiagramSchema = z.object({
  direction: FlowDirection.default("LR"),
  nodes: z.record(z.string(), FlowNodeSchema),
  edges: z.record(z.string(), FlowEdgeSchema),
}).superRefine((diagram, ctx) => {
  const nodeEntries = Object.entries(diagram.nodes)

  // ── Exactly one start and one end ──
  const startCount = nodeEntries.filter(([, n]) => n.type === 'start').length
  const endCount   = nodeEntries.filter(([, n]) => n.type === 'end').length

  if (startCount !== 1) {
    ctx.addIssue({
      code: "custom",
      message: `Diagram must have exactly one start node (found ${startCount}).`,
      path: ['nodes'],
    })
  }

  if (endCount !== 1) {
    ctx.addIssue({
      code: "custom",
      message: `Diagram must have exactly one end node (found ${endCount}).`,
      path: ['nodes'],
    })
  }

  // ── Build outgoing edge index ──
  const outgoing: Record<string, { edgeId: string; toKey: string }[]> = {}
  for (const [edgeId, edge] of Object.entries(diagram.edges)) {
    outgoing[edge.from] ??= []
    outgoing[edge.from].push({ edgeId, toKey: edge.to })
  }

  // ── Per-node structural rules ──
  for (const [nodeKey, node] of nodeEntries) {
    const outs = outgoing[nodeKey] ?? []

    if (node.type === 'automation') {
      if (outs.length !== 1) {
        ctx.addIssue({
          code: "custom",
          message: `automation node must have exactly one outgoing edge (found ${outs.length}).`,
          path: ['nodes', nodeKey],
        })
      } else if (diagram.nodes[outs[0].toKey]?.type !== 'decision') {
        ctx.addIssue({
          code: "custom",
          message: 'automation node must connect directly to a decision node.',
          path: ['nodes', nodeKey],
        })
      }
    }

    if (node.type === 'decision' && outs.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: `decision node must have at least two outgoing edges (found ${outs.length}).`,
        path: ['nodes', nodeKey],
      })
    }
  }

  // ── Per-edge structural rules ──
  for (const [edgeId, edge] of Object.entries(diagram.edges)) {
    const fromNode = diagram.nodes[edge.from]
    if (!fromNode) continue

    const hasTriggerId = 'triggerEventId' in edge
    const hasGuard     = 'guard' in edge

    if (fromNode.type === 'start' && (hasTriggerId || hasGuard)) {
      ctx.addIssue({
        code: "custom",
        message: 'Edges from start nodes cannot have a trigger or guard — instance creation is the implicit trigger.',
        path: ['edges', edgeId],
      })
    }

    if (fromNode.type === 'decision' && !hasGuard) {
      ctx.addIssue({
        code: "custom",
        message: 'Edges from decision nodes must have a guard — all paths must be explicit.',
        path: ['edges', edgeId, 'guard'],
      })
    }

    if (fromNode.type === 'decision' && hasTriggerId) {
      ctx.addIssue({
        code: "custom",
        message: 'Edges from decision nodes cannot have a trigger — traversal is automatic via guards.',
        path: ['edges', edgeId, 'triggerEventId'],
      })
    }

    if ((fromNode.type === 'process' || fromNode.type === 'automation') && !hasTriggerId) {
      ctx.addIssue({
        code: "custom",
        message: `Edges from ${fromNode.type} nodes must have a trigger.`,
        path: ['edges', edgeId, 'triggerEventId'],
      })
    }

    if ((fromNode.type === 'process' || fromNode.type === 'automation') && hasGuard) {
      ctx.addIssue({
        code: "custom",
        message: `Edges from ${fromNode.type} nodes cannot have a guard — use a decision node to branch.`,
        path: ['edges', edgeId, 'guard'],
      })
    }
  }
}).describe('The visual and structural definition of a workflow.')

export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

export const WorkflowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  example: z.string().optional(),
  trackedAssetTypeId: z.string().optional()
    .describe('ref AssetType.id'),
  diagram: FlowDiagramSchema,
}).describe('A reusable process definition associated with one or more BIM uses. Describes the ordered steps, responsibilities, and transitions that govern how work is carried out.')

export type Workflow = z.infer<typeof WorkflowSchema>

// ─── Guides & Annexes ─────────────────────────────────────────────────────────

export const AnnexSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: AnnexType,
  url: z.string().min(1),
  description: z.string().optional(),
}).describe('Supporting material attached to the BEP, such as a reference document or instructional video.')

export type Annex = z.infer<typeof AnnexSchema>

export const GuideSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional().describe("Short guide description, not it's content"),
  annexIds: z.array(z.string()).optional(),
}).describe('A how-to reference included in the BEP. Groups related annexes and provides direction on how specific tasks or standards should be applied.')

export type Guide = z.infer<typeof GuideSchema>

// ─── Standards ────────────────────────────────────────────────────────────────

export const StandardSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  contentPath: z.string()
    .describe('Relative path to the .md file inside the .bep archive.'),
}).describe('A normative reference or rule that governs how work is carried out on the project. Standards define what must be followed, as opposed to guides which explain how.')

export type Standard = z.infer<typeof StandardSchema>

// ─── LOIN ─────────────────────────────────────────────────────────────────────

export const LODSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  checklist: z.array(z.string()).optional(),
}).describe('A geometric detail level assigned to model elements in LOIN requirements. Specifies the geometric precision required of a model element at a given milestone.')

export type LOD = z.infer<typeof LODSchema>

export const LOISchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  checklist: z.array(z.string()).optional(),
}).describe('An information detail level assigned to model elements in LOIN requirements. Specifies the non-geometric properties required of a model element at a given milestone.')

export type LOI = z.infer<typeof LOISchema>

export const LOINMilestoneSchema = z.object({
  milestoneId: z.string(),
  lodId: z.string().min(1),
  loiId: z.string().min(1),
  idsPath: z.string().optional()
    .describe('Relative path to the .ids (Information Delivery Specification) file inside the .bep archive.'),
})

export type LOINMilestone = z.infer<typeof LOINMilestoneSchema>

export const LOINSchema = z.object({
  id: z.uuid(),
  element: z.string().min(1),
  disciplineId: z.string(),
  milestones: z.array(LOINMilestoneSchema).optional(),
}).describe('An information requirement for a model element. Declares what geometric detail and information properties are required for a specific model element and discipline across project milestones.')

export type LOIN = z.infer<typeof LOINSchema>

// ─── Notes & Flags ────────────────────────────────────────────────────────────

export const NoteSchema = z.object({
  id: z.uuid(),
  message: z.string().min(1),
  memberEmail: z.email(),
  createdAt: z.iso.datetime(),
}).describe('A timestamped comment left by a project member on the BEP.')

export type Note = z.infer<typeof NoteSchema>

export const FlagBaseSchema = z.object({
  id: z.uuid(),
  entity: FlagEntityType.nullable().describe('null = BEP-level flag'),
  entityId: z.string().nullable(),
  severity: FlagSeverity,
  message: z.string().min(1),
  generatedAt: z.iso.datetime(),
}).describe('A diagnostic message attached to the BEP or one of its entities. Indicates an issue or observation with a severity level that guides the author.')

export const FlagSchema = FlagBaseSchema
  .refine(f => (f.entity === null) === (f.entityId === null), {
    message: 'entity and entityId must both be null (BEP-level) or both be non-null (entity-level).',
  })

export type Flag = z.infer<typeof FlagSchema>

// ─── Deliverables ─────────────────────────────────────────────────────────────

export const DeliverableBaseSchema = z.object({
  id: z.uuid(),
  description: z.string().optional(),
  lbsNodeId: z.string().optional(),
  disciplineId:   z.string(),
  assetTypeId: z.string(),
  extensionIds: z.array(z.string()).optional(),
  responsibleId: z.string(),
  milestoneId:   z.string(),
  dueDate: z.iso.date().optional(),
  predecessorId: z.string().optional(),
}).describe('A formal output committed by a team at a milestone. Defines what must be delivered, in what format, by whom, and by when.')

export const DeliverableSchema = DeliverableBaseSchema
  .refine(d => !d.predecessorId || d.predecessorId !== d.id, {
    message: 'predecessorId cannot reference the deliverable itself.',
    path: ['predecessorId'],
  })

export type Deliverable = z.infer<typeof DeliverableSchema>

// ─── Environment variables ────────────────────────────────────────────────────

export const EnvVarSchema = z.object({
  key:         z.string().min(1).describe('Variable name referenced in effect handlers as config.KEY.'),
  description: z.string().optional(),
  secret:      z.boolean().optional().describe('If true, the value is masked in the UI after being saved.'),
}).describe('A runtime configuration entry for effect and automation handlers. Used to store credentials, endpoints, or other runtime settings without hardcoding them.')

export type EnvVar = z.infer<typeof EnvVarSchema>

// ─── BEP Root ─────────────────────────────────────────────────────────────────

export const BEPSchema = z.object({
  project:         ProjectSchema,
  deliverableNamingConvention: NamingConventionSchema.optional(),
  roles:           z.array(RoleSchema),
  members:         z.array(MemberSchema),
  teams:           z.array(TeamSchema),
  phases:          z.array(PhaseSchema),
  milestones:      z.array(MilestoneSchema),
  lbs:             z.array(LBSNodeSchema),
  disciplines:     z.array(DisciplineSchema),
  extensions:      z.array(ExtensionSchema),
  assetTypes:      z.array(AssetTypeSchema),
  softwares:       z.array(SoftwareSchema),
  objectives:      z.array(ObjectiveSchema),
  bimUses:         z.array(BIMUseSchema),
  actions:         z.array(ActionSchema),
  events:          z.array(FlowEventSchema),
  effects:         z.array(FlowEffectSchema),
  automations:     z.array(FlowAutomationSchema),
  env:             z.array(EnvVarSchema),
  workflows:       z.array(WorkflowSchema),
  guides:          z.array(GuideSchema),
  annexes:         z.array(AnnexSchema),
  standards:       z.array(StandardSchema),
  lods:            z.array(LODSchema),
  lois:            z.array(LOISchema),
  loin:            z.array(LOINSchema),
  deliverables:    z.array(DeliverableSchema),
  notes:           z.array(NoteSchema),
  flags:           z.array(FlagSchema),
})

export type BEP = z.infer<typeof BEPSchema>


// ─── Changelog ────────────────────────────────────────────────────────────────

export const BEPVersionBase = z.object({
  version: z.string().regex(/^\d+\.\d+$/)
    .describe('Format: "{major}.{minor}" (e.g. "1.0", "2.3").'),
  date: z.iso.datetime(),
  author: z.email().describe('ref Member.email'),
  description: z.string().min(1),
  diff: z.string().nullable()
    .describe('Relative path to inverse diff (RFC 6902). null on v0.0.'),
})

export const BEPVersionSchema = z.discriminatedUnion('type', [
  BEPVersionBase.extend({ type: z.literal('patch') }),
  BEPVersionBase.extend({
    type: z.literal('version'),
    approvedBy: z.array(z.email()).describe('ref Member.email[]'),
  }),
])

export type BEPVersion = z.infer<typeof BEPVersionSchema>

export const ChangelogSchema = z.object({
  current: z.string().regex(/^\d+\.\d+$/)
    .describe('Current version in "{major}.{minor}" format.'),
  versions: z.array(BEPVersionSchema),
})

export type Changelog = z.infer<typeof ChangelogSchema>
