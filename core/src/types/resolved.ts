import type {
  Action, Annex, FlowAutomation, BIMUse, Deliverable, Discipline,
  AssetType, Extension, Role, Guide, LBSNode,
  LOD, LOI, LOIN, LOINMilestone, Member, Milestone, Note,
  Objective, Phase, Software, Team, Workflow, FlowDiagram, FlowNode,
} from './schema.js'

// ─── RACI ─────────────────────────────────────────────────────────────────────

export type RaciAssignment = {
  role: Role
  members: MemberResolved[]
  team: TeamResolved | null
}

export type RaciRow = {
  workflow: { id: string; name: string }
  nodeId: string
  label: string
  actionId?: string
  description?: string
  responsible: RaciAssignment[]
  accountable: RaciAssignment[]
  consulted:   RaciAssignment[]
  informed:    RaciAssignment[]
}

export type RaciMatrix = {
  /** All unique roles present across all rows — use as column headers. */
  roles: Role[]
  rows: RaciRow[]
}

export type MemberResolved = Omit<Member, 'roleId'> & {
  role: Role | null
  team: { id: string; name: string } | null
  isRepresentative: boolean
}

export type TeamResolved = Omit<Team, 'representativeEmail' | 'memberEmails' | 'disciplineIds'> & {
  representative: MemberResolved | null
  members: MemberResolved[]
  disciplines: Discipline[]
}

export type MilestoneResolved = Omit<Milestone, 'phaseId'> & {
  phase: Phase | null
}

export type LBSNodeResolved = Omit<LBSNode, 'lbsNodeIds'> & {
  isRoot: boolean
  parent: Pick<LBSNode, 'id' | 'name' | 'type'> | null
  children: LBSNode[]
}

export type AssetTypeResolved = Omit<AssetType, 'extensionIds'> & {
  extensions: Extension[]
}

export type SoftwareResolved = Omit<Software, 'assetTypeIds'> & {
  assetTypes: AssetTypeResolved[]
}

export type BIMUseResolved = Omit<BIMUse, 'objectiveIds' | 'software' | 'milestoneIds' | 'workflowIds'> & {
  objectives: Objective[]
  software?: { description?: string; softwares: SoftwareResolved[] }
  milestones: MilestoneResolved[]
  workflows: WorkflowResolved[]
}

/** Resolved RACI assignment for one letter (R/A/C/I) at a node. */
export type RaciEntry = {
  roles:   Role[]
  teams:   Team[]
  members: Member[]
}

export type FlowNodeResolved = Omit<FlowNode,
  | 'actionId' | 'automationId'
  | 'responsibleRoleIds' | 'responsibleTeamIds' | 'responsibleEmails'
  | 'accountableRoleIds' | 'accountableTeamIds' | 'accountableEmails'
  | 'consultedRoleIds'   | 'consultedTeamIds'   | 'consultedEmails'
  | 'informedRoleIds'    | 'informedTeamIds'    | 'informedEmails'
> & {
  action:      Action | null
  automation:  FlowAutomation | null
  responsible: RaciEntry
  accountable: RaciEntry
  consulted:   RaciEntry
  informed:    RaciEntry
}

export type FlowDiagramResolved = Omit<FlowDiagram, 'nodes'> & {
  nodes: Record<string, FlowNodeResolved>
}

export type WorkflowResolved = Omit<Workflow, 'diagram'> & {
  diagram: FlowDiagramResolved
}

export type GuideResolved = Omit<Guide, 'annexIds'> & {
  annexes: Annex[]
}

export type ActionResolved = Omit<Action, 'guideIds' | 'softwareIds'> & {
  guides: GuideResolved[]
  softwares: Software[]
}

export type LOINMilestoneResolved = Omit<LOINMilestone, 'milestoneId' | 'lodId' | 'loiId'> & {
  milestone: Milestone | null
  lod: LOD | null
  loi: LOI | null
}

export type LOINResolved = Omit<LOIN, 'disciplineId' | 'milestones'> & {
  discipline: Discipline | null
  milestones: LOINMilestoneResolved[]
}

export type DeliverableResolved = Omit<
  Deliverable,
  'lbsNodeId' | 'disciplineId' | 'assetTypeId' | 'extensionIds' | 'responsibleId' | 'milestoneId' | 'predecessorId'
> & {
  nomenclatureCode: string
  /** Resolved delivery date: dueDate if set, otherwise the milestone's date. */
  effectiveDate: string
  lbsNode: LBSNodeResolved | null
  discipline: Discipline | null
  assetType: AssetTypeResolved | null
  extensions: Extension[]
  responsible: TeamResolved | null
  milestone: MilestoneResolved | null
  predecessor: DeliverableResolved | null
}

export type NoteResolved = Omit<Note, 'memberEmail'> & {
  member: MemberResolved | null
}
