import JSZip from 'jszip'
import type { BEP, NamingConvention, Project } from './types/schema.js'
import { NamingConventionSchema, ProjectSchema } from './types/schema.js'
import { normalizeBep } from './utils/normalize.js'
import { validateTokenValue, validateAllTokens } from './utils/naming.js'
import { Singleton } from './base/singleton.js'
import { Actions } from './entities/actions.js'
import { Annexes } from './entities/annexes.js'
import { Effects } from './entities/effects.js'
import { Automations } from './entities/automations.js'
import { Env } from './entities/env.js'
import { Events } from './entities/events.js'
import { Deliverables } from './entities/deliverables.js'
import { Flags } from './entities/flags.js'
import { Notes } from './entities/notes.js'
import { BIMUses } from './entities/bimUses.js'
import { Disciplines } from './entities/disciplines.js'
import { Guides } from './entities/guides.js'
import { LODs } from './entities/lods.js'
import { LOIs } from './entities/lois.js'
import { LOINEntity } from './entities/loin.js'
import { AssetTypes } from './entities/assetTypes.js'
import { Extensions } from './entities/extensions.js'
import { Roles } from './entities/roles.js'
import { LBSNodes } from './entities/lbsNodes.js'
import { Members } from './entities/members.js'
import { Milestones } from './entities/milestones.js'
import { Objectives } from './entities/objectives.js'
import { Phases } from './entities/phases.js'
import { Softwares } from './entities/softwares.js'
import { Standards } from './entities/standards.js'
import { Teams } from './entities/teams.js'
import { Workflows } from './entities/workflows.js'
import { History } from './base/history.js'
import { Nomenclature } from './utils/nomenclature.js'
import { TextFile } from './utils/textFile.js'
import { Engine } from './runtime/Engine.js'

export class Bep {
  // ─── Singleton fields ─────────────────────────────────────────────────────

  readonly project: Singleton<Project>

  // ─── Entities ─────────────────────────────────────────────────────────────

  readonly actions: Actions
  readonly annexes: Annexes
  readonly deliverables: Deliverables
  readonly effects: Effects
  readonly automations: Automations
  readonly env: Env
  readonly events: Events
  readonly notes: Notes
  readonly flags: Flags
  readonly bimUses: BIMUses
  readonly disciplines: Disciplines
  readonly guides: Guides
  readonly lods: LODs
  readonly lois: LOIs
  readonly loin: LOINEntity
  readonly lbsNodes: LBSNodes
  readonly assetTypes: AssetTypes
  readonly extensions: Extensions
  readonly roles: Roles
  readonly members: Members
  readonly milestones: Milestones
  readonly objectives: Objectives
  readonly phases: Phases
  readonly softwares: Softwares
  readonly standards: Standards
  readonly teams: Teams
  readonly workflows: Workflows

  // ─── Engine ───────────────────────────────────────────────────────────────

  readonly engine: Engine

  // ─── History ──────────────────────────────────────────────────────────────

  readonly history: History

  // ─── Nomenclature ─────────────────────────────────────────────────────────

  readonly nomenclature: Nomenclature

  // ─── Project files ────────────────────────────────────────────────────────

  readonly memory: TextFile
  readonly skill: TextFile
  readonly icon: TextFile

  private constructor(
    private _data: BEP,
    private _zip: JSZip,
  ) {
    const bep = () => this._data
    this.project = new Singleton(
      () => this._data.project,
      (p) => { this._data.project = p },
      ProjectSchema,
      (p, bep) => {
        const errors: string[] = []
        const tokenErr = validateTokenValue('project', p.code, bep.deliverableNamingConvention)
        if (tokenErr) errors.push(tokenErr)
        if (p.clientId && !bep.teams.some(t => t.id === p.clientId))
          errors.push(`teams["${p.clientId}"] not found`)
        return errors
      },
      bep,
    )
    this.actions        = new Actions(bep)
    this.annexes        = new Annexes(bep)
    this.env            = new Env(bep)
    this.events         = new Events(bep)
    this.effects        = new Effects(bep)
    this.automations    = new Automations(bep)
    this.bimUses        = new BIMUses(bep, () => this.workflows)
    this.disciplines    = new Disciplines(bep)
    this.guides         = new Guides(bep)
    this.lods           = new LODs(bep)
    this.lois           = new LOIs(bep)
    this.loin           = new LOINEntity(bep)
    this.lbsNodes       = new LBSNodes(bep)
    this.assetTypes     = new AssetTypes(bep)
    this.extensions     = new Extensions(bep)
    this.roles           = new Roles(bep)
    this.members        = new Members(bep)
    this.milestones     = new Milestones(bep)
    this.objectives     = new Objectives(bep)
    this.phases         = new Phases(bep)
    this.softwares      = new Softwares(bep, () => this.assetTypes)
    this.standards      = new Standards(bep, () => this._zip)
    this.teams          = new Teams(bep, () => this.members)
    this.workflows      = new Workflows(bep, () => this.members, () => this.teams)
    this.deliverables   = new Deliverables(bep, () => this.teams, () => this.assetTypes, () => this.lbsNodes, () => this.milestones)
    this.notes          = new Notes(bep, () => this.members)
    this.flags          = new Flags(bep)
    this.engine  = new Engine(
      () => this._data,
      (version) => this.history.get(version),
    )
    this.history = new History(
      bep,
      (newBep) => { this._data = newBep },
      () => this._zip,
    )
    this.nomenclature = new Nomenclature(bep)
    this.memory = new TextFile('memory.md', () => this._zip)
    this.skill  = new TextFile('skills/bep-authoring/SKILL.md', () => this._zip)
    this.icon   = new TextFile('icon.svg',  () => this._zip)
  }

  // ─── Factory ──────────────────────────────────────────────────────────────

  /**
   * Opens a .bep archive from a buffer.
   * The caller is responsible for obtaining the buffer (fs.readFile in Node,
   * fetch + arrayBuffer() in the browser, etc.).
   *
   * Automatically initializes any missing files (memory.md, skills/bep-authoring/SKILL.md,
   * standards content, baseline and v0.0 terminus) so the instance is always
   * fully operational after open(). Idempotent — existing files are untouched.
   */
  static async open(buffer: Uint8Array | ArrayBuffer | Buffer): Promise<Bep> {
    const zip = await JSZip.loadAsync(buffer)
    const bepJsonFile = zip.file('bep.json')
    if (!bepJsonFile) throw new Error('Invalid .bep file: missing bep.json')
    const raw = await bepJsonFile.async('string')
    const data = normalizeBep(JSON.parse(raw) as BEP)
    await Bep._initialize(data, zip)
    return new Bep(data, zip)
  }

  /**
   * Ensures all expected files exist in the zip.
   * Called by open() after loading bep.json. Safe to call multiple times.
   *
   * Does NOT create changelog.json — that is created on the first commit().
   * The v0.0 terminus snapshot (changelog/v0.0.json) is the hidden root of
   * the diff chain; it is never exposed as a user-facing version. The first
   * commit() bumps to v0.1 (patch) or v1.0 (version) and writes the inverse
   * diff against this terminus. The baseline is written so history.status()
   * and history.discard() work before the first commit.
   */
  private static async _initialize(data: BEP, zip: JSZip): Promise<void> {
    // Text files
    if (!zip.file('memory.md')) zip.file('memory.md', '')
    if (!zip.file('skills/bep-authoring/SKILL.md')) zip.file('skills/bep-authoring/SKILL.md', '')

    // Standards content files — ensure each .md referenced in bep.json exists
    for (const standard of data.standards) {
      if (!zip.file(standard.contentPath)) zip.file(standard.contentPath, '')
    }

    // Versioning bootstrap — only if no baseline exists yet
    // baseline/bep.json is used as the sentinel: if it's present, the zip
    // was already initialized (either by a previous open() or by commit()).
    if (!zip.file('baseline/bep.json')) {
      const snapshot = JSON.stringify(data, null, 2)
      zip.file('baseline/bep.json', snapshot)
      zip.file('changelog/v0.0.json', snapshot)
      for (const standard of data.standards) {
        const content = await zip.file(standard.contentPath)!.async('string')
        zip.file(`baseline/standards/${standard.id}.md`, content)
        zip.file(`changelog/standards/${standard.id}/v0.0.md`, content)
      }
    }
  }

  static create(project: Project): Bep {
    const data = normalizeBep({
      project: { name: project.name, code: project.code, clientId: project.clientId, description: project.description },
      roles: [],
      members: [],
      teams: [],
      phases: [],
      milestones: [],
      lbs: [],
      disciplines: [],
      extensions: [],
      assetTypes: [],
      softwares: [],
      objectives: [],
      bimUses: [],
      actions: [],
      events: [],
      effects: [],
      workflows: [],
      guides: [],
      annexes: [],
      standards: [],
      lods: [],
      lois: [],
      loin: [],
      deliverables: [],
      notes: [],
      flags: [],
      env: [],
      automations: [],
    } as unknown as BEP)
    const zip = new JSZip()
    // Initialize required files so the zip is fully functional from the start.
    // changelog.json is omitted — commit() creates it. The v0.0 terminus is the
    // hidden root; the first commit() bumps to v0.1 (patch) or v1.0 (version).
    const snapshot = JSON.stringify(data, null, 2)
    zip.file('memory.md', '')
    zip.file('skills/bep-authoring/SKILL.md', '')
    zip.file('baseline/bep.json', snapshot)
    zip.file('changelog/v0.0.json', snapshot)
    return new Bep(data, zip)
  }


  // ─── Accessors ────────────────────────────────────────────────────────────

  get data(): BEP {
    return this._data
  }

  // ─── Deliverable naming convention ────────────────────────────────────────

  getNamingConvention(): NamingConvention | undefined {
    return this._data.deliverableNamingConvention
  }

  /** Pass null to remove the convention and fall back to the default format. */
  setNamingConvention(convention: NamingConvention | null): void {
    if (convention === null) {
      delete this._data.deliverableNamingConvention
      return
    }
    const parsed = NamingConventionSchema.parse(convention)
    const errors = validateAllTokens(this._data, parsed)
    if (errors.length) throw new Error(`Naming convention incompatible with existing data:\n${errors.join('\n')}`)
    this._data.deliverableNamingConvention = parsed
  }

  // ─── File access ──────────────────────────────────────────────────────────

  /** Reads any text file stored inside the .bep archive by its zip path. */
  async readFile(path: string): Promise<string | null> {
    const file = this._zip.file(path)
    return file ? file.async('string') : null
  }

  // ─── Skills ───────────────────────────────────────────────────────────────

  /** Returns the names of all skills present in the archive. */
  listSkills(): string[] {
    const names = new Set<string>()
    this._zip.forEach((path) => {
      const match = path.match(/^skills\/([^/]+)\/SKILL\.md$/)
      if (match) names.add(match[1]!)
    })
    return [...names]
  }

  /** Returns the SKILL.md content for the given skill, or null if it does not exist. */
  async getSkill(name: string): Promise<string | null> {
    const file = this._zip.file(`skills/${name}/SKILL.md`)
    return file ? file.async('string') : null
  }

  /** Writes the SKILL.md content for the given skill, creating it if needed. */
  async setSkill(name: string, content: string): Promise<void> {
    this._zip.file(`skills/${name}/SKILL.md`, content)
  }

  /** Returns the names of all resource files for the given skill. */
  listSkillResources(name: string): string[] {
    const prefix = `skills/${name}/resources/`
    const files: string[] = []
    this._zip.forEach((path) => {
      if (path.startsWith(prefix) && path !== prefix) {
        files.push(path.slice(prefix.length))
      }
    })
    return files
  }

  /** Returns the content of a resource file for the given skill, or null if it does not exist. */
  async getSkillResource(name: string, filename: string): Promise<string | null> {
    const file = this._zip.file(`skills/${name}/resources/${filename}`)
    return file ? file.async('string') : null
  }

  /** Writes a resource file for the given skill, creating it if needed. */
  async setSkillResource(name: string, filename: string, content: string): Promise<void> {
    this._zip.file(`skills/${name}/resources/${filename}`, content)
  }

  /** Removes a skill's SKILL.md and all its resources from the archive. No-op if not found. */
  removeSkill(name: string): void {
    const prefix = `skills/${name}/`
    const toDelete: string[] = []
    this._zip.forEach((path) => { if (path.startsWith(prefix)) toDelete.push(path) })
    toDelete.forEach(path => this._zip.remove(path))
  }

  /** Removes a single resource file from a skill. No-op if not found. */
  removeSkillResource(name: string, filename: string): void {
    this._zip.remove(`skills/${name}/resources/${filename}`)
  }

  // ─── Type generation ──────────────────────────────────────────────────────

  /**
   * Generates a TypeScript declaration string with typed contracts for this BEP's
   * effects and automations. Write the output to a `.d.ts` file and import
   * `BepContract` from it to get full type safety in your Runtime subclass.
   *
   * @example
   * import { writeFileSync } from 'node:fs'
   * writeFileSync('bep.d.ts', bep.generateTypes())
   */
  generateTypes(): string {
    const tsType = (t: string) => t === 'url' ? 'string' : t

    const payloadToType = (fields?: { key: string; type: string; required: boolean }[]): string => {
      if (!fields || fields.length === 0) return 'Record<string, never>'
      const props = fields.map(f => `    ${f.key}${f.required ? '' : '?'}: ${tsType(f.type)}`).join('\n')
      return `{\n${props}\n  }`
    }

    const effectLines = this._data.effects.length
      ? this._data.effects.map(e => `  '${e.id}': ${payloadToType(e.payload)}`).join('\n')
      : '  [key: string]: Record<string, never>'

    const automationLines = this._data.automations.length
      ? this._data.automations.map(a => `  '${a.id}': ${payloadToType(a.payload)}`).join('\n')
      : '  [key: string]: Record<string, never>'

    return [
      '// Generated by bep.generateTypes() — do not edit manually',
      '',
      'export interface BepEffectPayloads {',
      effectLines,
      '}',
      '',
      'export interface BepAutomationPayloads {',
      automationLines,
      '}',
      '',
      'export interface BepTypes {',
      '  effects:     BepEffectPayloads',
      '  automations: BepAutomationPayloads',
      '}',
      '',
    ].join('\n')
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * Serializes the .bep archive to a Uint8Array.
   * The caller is responsible for persisting it (fs.writeFile in Node,
   * a download link in the browser, etc.).
   */
  async save(): Promise<Uint8Array> {
    this._zip.file('bep.json', JSON.stringify(this._data, null, 2))
    return this._zip.generateAsync({ type: 'uint8array' })
  }
}

export * from "./base"
export * from './entities'
export * from './utils'
export * from './types'
export * from './runtime'
