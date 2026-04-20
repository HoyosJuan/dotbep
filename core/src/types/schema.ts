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
})

export type Project = z.infer<typeof ProjectSchema>

// ─── Participants ─────────────────────────────────────────────────────────────

export const RoleSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export type Role = z.infer<typeof RoleSchema>

export const MemberSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  roleId: z.string(),
  description: z.string().optional(),
  bepEditor: z.boolean().optional(),
})

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
})

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
})
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
})

export type Phase = z.infer<typeof PhaseSchema>

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  date: z.iso.date(),
  phaseId: z.string(),
  description: z.string().optional(),
})

export type Milestone = z.infer<typeof MilestoneSchema>

export const LBSNodeBaseSchema = z.object({
  id: z.string().min(1)
    .describe('Used in deliverables nomenclature.'),
  name: z.string().min(1),
  type: LBSNodeType,
  description: z.string().optional(),
  lbsNodeIds: z.array(z.string()).optional()
    .describe('ref LBSNode.id[]'),
})

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
})

export type Discipline = z.infer<typeof DisciplineSchema>

// ─── Files ────────────────────────────────────────────────────────────────────

export const ExtensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

export type Extension = z.infer<typeof ExtensionSchema>

export const AssetTypeSchema = z.object({
  id: z.string().min(1)
    .describe('Used in deliverables nomenclature.'),
  name: z.string().min(1),
  extensionIds: z.array(z.string()).optional(),
})

export type AssetType = z.infer<typeof AssetTypeSchema>

export const SoftwareSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  assetTypeIds: z.array(z.string()).optional(),
  url: z.string().optional(),
})

export type Software = z.infer<typeof SoftwareSchema>

// ─── BIM Uses ─────────────────────────────────────────────────────────────────

export const ObjectiveSchema = z.object({
  id: z.uuid(),
  description: z.string().min(1),
})

export type Objective = z.infer<typeof ObjectiveSchema>

export const BIMUseSoftwareSchema = z.object({
  description: z.string().optional(),
  ids: z.array(z.string())
    .describe('ref Software.id[]'),
})

export type BIMUseSoftware = z.infer<typeof BIMUseSoftwareSchema>

export const BIMUseSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  objectiveIds: z.array(z.string()).optional(),
  software: BIMUseSoftwareSchema.optional(),
  milestoneIds: z.array(z.string()).optional(),
  workflowIds: z.array(z.string()).optional(),
})

export type BIMUse = z.infer<typeof BIMUseSchema>

// ─── Actions & Workflows ──────────────────────────────────────────────────────

export const ActionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  softwareIds: z.array(z.string()).optional().describe('ref Software.id[]'),
  guideIds: z.array(z.string()).optional().describe('ref Guide.id[]'),
})

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
})

export type FlowEvent = z.infer<typeof FlowEventSchema>

export const FlowEffectSchema = z.object({
  id:          z.string().min(1).describe('Human-readable slug, e.g. "notify".'),
  name:        z.string().min(1),
  description: z.string().optional(),
  payload:     z.array(FlowPayloadFieldSchema).optional(),
})

export type FlowEffect = z.infer<typeof FlowEffectSchema>

export const FlowAutomationSchema = z.object({
  id:          z.string().min(1).describe('Human-readable slug, e.g. "verify-tolerances".'),
  name:        z.string().min(1),
  description: z.string().optional(),
  payload:     z.array(FlowPayloadFieldSchema).optional()
    .describe('Fields consumed from instance context and passed to the handler.'),
  output:      z.array(FlowPayloadFieldSchema)
    .describe('Fields the handler must return. Guards on outgoing edges reference these.'),
})

export type FlowAutomation = z.infer<typeof FlowAutomationSchema>

// ─── Flow graph ───────────────────────────────────────────────────────────────

export const NodeTimeoutSchema = z.object({
  hours:    z.number().positive(),
  effectId: z.string().min(1).describe('ref FlowEffect.id'),
})

export type NodeTimeout = z.infer<typeof NodeTimeoutSchema>

export const FlowNodeSchema = z.object({
  type:      NodeType,
  label:     z.string().optional(),
  actionId:      z.string().optional().describe('ref Action.id'),
  automationId:  z.string().optional().describe('ref FlowAutomation.id'),
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
  timeout:   NodeTimeoutSchema.optional(),

  // ── Composition ──
  workflowId: z.string().optional().describe('ref Workflow.id — spawns child instances of this workflow when the node is entered.'),
  blocking:   z.boolean().optional().describe('If true, waits for all spawned child instances to complete before accepting outgoing transitions.'),
})
  .refine(n => !(n.actionId && n.workflowId), {
    message: 'A node cannot have both actionId and workflowId.',
    path: ['workflowId'],
  })
  .refine(n => !n.blocking || !!n.workflowId, {
    message: 'blocking requires workflowId to be set.',
    path: ['blocking'],
  })
  .refine(n => n.type !== 'automation' || !!n.automationId, {
    message: 'Automation nodes require automationId.',
    path: ['automationId'],
  })
  // ── label ──
  .refine(n => n.type !== 'decision' || !!n.label, {
    message: 'decision nodes require a label.',
    path: ['label'],
  })
  .refine(n => n.type === 'decision' || !n.label, {
    message: 'label is only valid on decision nodes.',
    path: ['label'],
  })
  // ── actionId / automationId / workflowId per type ──
  .refine(n => !['start', 'end'].includes(n.type) || (!n.actionId && !n.automationId && !n.workflowId), {
    message: 'start/end nodes cannot have actionId, automationId, or workflowId.',
    path: ['type'],
  })
  .refine(n => n.type !== 'decision' || (!n.actionId && !n.automationId && !n.workflowId), {
    message: 'decision nodes cannot have actionId, automationId, or workflowId.',
    path: ['type'],
  })
  .refine(n => n.type !== 'automation' || (!n.actionId && !n.workflowId), {
    message: 'automation nodes cannot have actionId or workflowId.',
    path: ['type'],
  })
  .refine(n => n.type !== 'process' || !n.automationId, {
    message: 'process nodes cannot have automationId.',
    path: ['automationId'],
  })
  // ── RACI only on process and decision ──
  .refine(n => ['process', 'decision'].includes(n.type) || (
    !n.responsibleRoleIds?.length && !n.accountableRoleIds?.length &&
    !n.consultedRoleIds?.length   && !n.informedRoleIds?.length &&
    !n.responsibleTeamIds?.length && !n.accountableTeamIds?.length &&
    !n.consultedTeamIds?.length   && !n.informedTeamIds?.length &&
    !n.responsibleEmails?.length  && !n.accountableEmails?.length &&
    !n.consultedEmails?.length    && !n.informedEmails?.length
  ), {
    message: 'RACI fields are only valid on process and decision nodes.',
    path: ['type'],
  })
  // ── timeout only on process and automation ──
  .refine(n => ['process', 'automation'].includes(n.type) || !n.timeout, {
    message: 'timeout is only valid on process and automation nodes.',
    path: ['timeout'],
  })

export type FlowNode = z.infer<typeof FlowNodeSchema>

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

export const FlowEdgeSchema = z.object({
  from:       z.string().describe('ref FlowNode key'),
  to:         z.string().describe('ref FlowNode key'),
  label:      z.string().optional(),
  triggerEventId: z.string().min(1).optional().describe('ref FlowEvent.id — the event that fires this transition'),
  guard:      EdgeGuardSchema.optional().describe('Condition that must be true for this edge to be taken. On decision nodes: evaluated automatically against the instance context. On process nodes: evaluated against the event payload at trigger time.'),
  effectIds:  z.array(z.string().min(1)).optional().describe('ref FlowEffect.id[]'),
})
  .refine(e => e.from !== e.to, {
    message: 'A flow edge cannot point from a node to itself.',
    path: ['to'],
  })

export type FlowEdge = z.infer<typeof FlowEdgeSchema>

export const FlowDiagramSchema = z.object({
  direction: FlowDirection.default("LR"),
  nodes: z.record(z.string(), FlowNodeSchema),
  edges: z.record(z.string(), FlowEdgeSchema),
}).superRefine((diagram, ctx) => {
  for (const [edgeId, edge] of Object.entries(diagram.edges)) {
    const fromNode = diagram.nodes[edge.from]
    if (!fromNode) continue

    if (fromNode.type === 'start' && edge.triggerEventId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Edges from start nodes cannot have a trigger — instance creation is the implicit trigger.',
        path: ['edges', edgeId, 'trigger'],
      })
    }

    if (fromNode.type === 'decision' && edge.triggerEventId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Edges from decision nodes cannot have a trigger — traversal is automatic via guards.',
        path: ['edges', edgeId, 'trigger'],
      })
    }

    if ((fromNode.type === 'process' || fromNode.type === 'automation') && edge.triggerEventId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Edges from ${fromNode.type} nodes must have a trigger.`,
        path: ['edges', edgeId, 'trigger'],
      })
    }
  }
})

export type FlowDiagram = z.infer<typeof FlowDiagramSchema>

export const WorkflowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  example: z.string().optional(),
  trackedAssetTypeId: z.string().optional()
    .describe('ref AssetType.id — the asset type this workflow operates on.'),
  diagram: FlowDiagramSchema,
})

export type Workflow = z.infer<typeof WorkflowSchema>

// ─── Guides & Annexes ─────────────────────────────────────────────────────────

export const AnnexSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: AnnexType,
  url: z.string().min(1),
  description: z.string().optional(),
})

export type Annex = z.infer<typeof AnnexSchema>

export const GuideSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional().describe("Short guide description, not it's content"),
  annexIds: z.array(z.string()).optional(),
})

export type Guide = z.infer<typeof GuideSchema>

// ─── Standards ────────────────────────────────────────────────────────────────

export const StandardSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  contentPath: z.string()
    .describe('Relative path to the .md file inside the .bep archive.'),
})

export type Standard = z.infer<typeof StandardSchema>

// ─── LOIN ─────────────────────────────────────────────────────────────────────

export const LODSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  checklist: z.array(z.string()).optional(),
})

export type LOD = z.infer<typeof LODSchema>

export const LOISchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  checklist: z.array(z.string()).optional(),
})

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
})

export type LOIN = z.infer<typeof LOINSchema>

// ─── Notes & Flags ────────────────────────────────────────────────────────────

export const NoteSchema = z.object({
  id: z.uuid(),
  message: z.string().min(1),
  memberEmail: z.email(),
  createdAt: z.iso.datetime(),
})

export type Note = z.infer<typeof NoteSchema>

export const FlagBaseSchema = z.object({
  id: z.uuid(),
  entity: FlagEntityType.nullable().describe('null = BEP-level flag'),
  entityId: z.string().nullable(),
  severity: FlagSeverity,
  message: z.string().min(1),
  generatedAt: z.iso.datetime(),
})

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
})

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
})

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
