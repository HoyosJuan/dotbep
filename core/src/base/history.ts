import { compare, applyPatch, type Operation } from 'fast-json-patch'
import type JSZip from 'jszip'
import type { BEP, BEPVersion, Changelog, Standard } from '../types/schema.js'
import { diffBep } from '../utils/diff.js'
import { normalizeBep } from '../utils/normalize.js'
import type { BepDiff, BepStatus, StandardChange, CommitParams, SquashParams } from '../types/history.js'

export type { BepStatus, StandardChange, CommitParams, SquashParams }

export type CompareResult = {
  diff: Operation[]
  standards: {
    added: { id: string; name: string }[]
    removed: { id: string; name: string }[]
    contentModified: { id: string; name: string; changedIn: string[] }[]
  }
}

export type BEPVersionResolved = {
  version: string
  type: 'patch' | 'version'
  date: string
  description: string
  diff: string | null
  isCurrent: boolean
  author: { email: string; name: string | null } | null
  approvedBy?: { email: string; name: string | null }[]
}

// ─── History ──────────────────────────────────────────────────────────────────

export class History {
  constructor(
    private getBep: () => BEP,
    private setBep: (bep: BEP) => void,
    private getZip: () => JSZip,
  ) {}

  // ─── Version helpers ──────────────────────────────────────────────────────

  private static parseVersion(v: string): { major: number; minor: number } {
    const [major, minor] = v.split('.').map(Number)
    return { major, minor }
  }

  static compareVersions(a: string, b: string): number {
    const pa = History.parseVersion(a)
    const pb = History.parseVersion(b)
    if (pa.major !== pb.major) return pa.major - pb.major
    return pa.minor - pb.minor
  }

  private static bumpVersion(current: string, type: BEPVersion['type']): string {
    const [major, minor] = current.split('.').map(Number)
    return type === 'version' ? `${major + 1}.0` : `${major}.${minor + 1}`
  }

  // ─── Zip helpers ──────────────────────────────────────────────────────────

  private async readChangelog(): Promise<Changelog | null> {
    const file = this.getZip().file('changelog.json')
    if (!file) return null
    return JSON.parse(await file.async('string')) as Changelog
  }

  private async readBaseline(): Promise<BEP | null> {
    const file = this.getZip().file('baseline/bep.json')
    if (!file) return null
    return normalizeBep(JSON.parse(await file.async('string')) as BEP)
  }

  // ─── Standards versioning helpers ─────────────────────────────────────────

  /**
   * At commit time: for each standard whose .md content changed since the last
   * snapshot, saves changelog/standards/{id}/v{version}.md.
   */
  private async snapshotChangedStandards(bep: BEP, newVersion: string): Promise<void> {
    const zip = this.getZip()
    for (const standard of bep.standards) {
      const currentFile = zip.file(standard.contentPath)
      if (!currentFile) continue
      const currentContent = await currentFile.async('string')

      const prefix = `changelog/standards/${standard.id}/`
      const existingVersions = Object.keys(zip.files)
        .filter(k => k.startsWith(prefix) && k.endsWith('.md') && k.slice(prefix.length).startsWith('v'))
        .map(k => k.slice(prefix.length + 1, -3)) // strip prefix+'v' and '.md' → "0.1"

      let prevContent: string | null = null
      if (existingVersions.length > 0) {
        const latest = existingVersions.sort((a, b) => History.compareVersions(b, a))[0]
        const snapshotFile = zip.file(`${prefix}v${latest}.md`)
        if (snapshotFile) prevContent = await snapshotFile.async('string')
      }

      if (prevContent !== currentContent) {
        zip.file(`${prefix}v${newVersion}.md`, currentContent)
      }
    }
  }

  /**
   * Copies each standards/{uuid}.md to baseline/standards/{id}.md so that
   * discard() can restore the .md files to their last committed state.
   */
  private async snapshotBaseStandards(bep: BEP): Promise<void> {
    const zip = this.getZip()
    for (const standard of bep.standards) {
      const currentFile = zip.file(standard.contentPath)
      if (!currentFile) continue
      const content = await currentFile.async('string')
      zip.file(`baseline/standards/${standard.id}.md`, content)
    }
  }

  /**
   * Resolves the .md content of a standard at a specific historical version.
   * Finds the latest snapshot in changelog/standards/{id}/ with version ≤ target.
   * Falls back to the current file if no snapshot exists (content never changed).
   */
  async resolveStandardContent(standard: Standard, targetVersion: string): Promise<string | null> {
    const zip = this.getZip()
    const prefix = `changelog/standards/${standard.id}/`
    const candidates = Object.keys(zip.files)
      .filter(k => k.startsWith(prefix) && k.endsWith('.md') && k.slice(prefix.length).startsWith('v'))
      .map(k => k.slice(prefix.length + 1, -3)) // strip 'v' and '.md'
      .filter(v => History.compareVersions(v, targetVersion) <= 0)
      .sort((a, b) => History.compareVersions(b, a))

    if (candidates.length === 0) {
      const currentFile = zip.file(standard.contentPath)
      return currentFile ? currentFile.async('string') : null
    }

    const file = zip.file(`${prefix}v${candidates[0]}.md`)
    return file ? file.async('string') : null
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async current(): Promise<string> {
    const changelog = await this.readChangelog()
    return changelog?.current ?? '0.0'
  }

  async list(): Promise<BEPVersion[]> {
    const changelog = await this.readChangelog()
    return changelog?.versions ?? []
  }

  async commit(params: CommitParams, force = false): Promise<BEPVersion> {
    const zip = this.getZip()
    const currentBep = this.getBep()
    const changelog = await this.readChangelog()
    const baseline = await this.readBaseline()
    const date = new Date().toISOString()

    if (!baseline) throw new Error('No baseline found — create a BEP with Bep.create() or open one with Bep.open()')

    if (params.type === 'version') {
      const missing = params.approvedBy.filter(email => !currentBep.members.some(m => m.email === email))
      if (missing.length) throw new Error(`Members not found: ${missing.join(', ')}`)
    }

    if (!force) {
      const hasChanges = await this.hasPendingChanges()
      if (!hasChanges) throw new Error('No pending changes since last commit')
    }

    // Bump from current version (defaults to '0.0' — the hidden terminus — on first commit,
    // so the first user commit always produces '0.1' for patch or '1.0' for version).
    const currentVersion = changelog?.current ?? '0.0'
    const newVersionStr = History.bumpVersion(currentVersion, params.type)
    const diffPath = `changelog/v${newVersionStr}.diff.json`
    const inverseDiff: Operation[] = compare(currentBep, baseline)

    const version: BEPVersion = params.type === 'patch'
      ? { version: newVersionStr, type: 'patch', date, author: params.author, description: params.description, diff: diffPath }
      : { version: newVersionStr, type: 'version', date, author: params.author, description: params.description, approvedBy: params.approvedBy, diff: diffPath }

    const newChangelog: Changelog = {
      current: newVersionStr,
      versions: [...(changelog?.versions ?? []), version],
    }

    zip.file(diffPath, JSON.stringify(inverseDiff, null, 2))
    await this.snapshotChangedStandards(currentBep, newVersionStr)
    zip.file('baseline/bep.json', JSON.stringify(currentBep, null, 2))
    await this.snapshotBaseStandards(currentBep)
    zip.file('changelog.json', JSON.stringify(newChangelog, null, 2))

    return version
  }

  /**
   * Reconstructs the BEP state at the given version (read-only).
   * Applies inverse diffs backward from the current state.
   */
  async get(version: string): Promise<BEP> {
    const changelog = await this.readChangelog()
    if (!changelog) throw new Error('No changelog found — call commit() first')

    // Current version — return a clone of the live state
    if (version === changelog.current)
      return JSON.parse(JSON.stringify(this.getBep()))

    const targetIndex = changelog.versions.findIndex(v => v.version === version)

    // Terminus not in versions[] (e.g. v0.0 created by Bep.create() before any commit)
    // — fall back to loading the snapshot file directly
    if (targetIndex === -1) {
      const file = this.getZip().file(`changelog/v${version}.json`)
      if (!file) throw new Error(`Version not found: ${version}`)
      return normalizeBep(JSON.parse(await file.async('string')))
    }

    // Terminus (diff === null) — load the full snapshot for that version
    if (changelog.versions[targetIndex].diff === null) {
      const file = this.getZip().file(`changelog/v${version}.json`)
      if (!file) throw new Error(`Missing terminus: changelog/v${version}.json`)
      return normalizeBep(JSON.parse(await file.async('string')))
    }

    // Apply inverse diffs backward from current state to reach target version
    const newerVersions = changelog.versions
      .filter(v => History.compareVersions(v.version, version) > 0)
      .sort((a, b) => History.compareVersions(b.version, a.version))

    const state: BEP = JSON.parse(JSON.stringify(this.getBep()))
    for (const v of newerVersions) {
      if (!v.diff) break
      const diffFile = this.getZip().file(v.diff)
      if (!diffFile) throw new Error(`Missing diff file: ${v.diff}`)
      const ops: Operation[] = JSON.parse(await diffFile.async('string'))
      applyPatch(state, ops)
    }
    return normalizeBep(state)
  }

  /** Returns the RFC 6902 diff and standards summary between two versions. */
  async compare(versionA: string, versionB: string): Promise<CompareResult> {
    const [stateA, stateB, changelog] = await Promise.all([
      this.get(versionA),
      this.get(versionB),
      this.readChangelog(),
    ])
    const diff = compare(stateA, stateB)

    const fromStdIds = new Set(stateA.standards.map(s => s.id))
    const toStdIds   = new Set(stateB.standards.map(s => s.id))
    const added   = stateB.standards.filter(s => !fromStdIds.has(s.id)).map(s => ({ id: s.id, name: s.name }))
    const removed = stateA.standards.filter(s => !toStdIds.has(s.id)).map(s => ({ id: s.id, name: s.name }))

    const versions = changelog?.versions ?? []
    const versionsInRange = versions
      .filter(v => History.compareVersions(v.version, versionA) > 0 && History.compareVersions(v.version, versionB) <= 0)
      .map(v => v.version)

    const zip = this.getZip()
    const contentModified = (await Promise.all(
      stateB.standards.filter(s => fromStdIds.has(s.id)).map(async s => {
        const changedIn = (await Promise.all(
          versionsInRange.map(async v => {
            const file = zip.file(`changelog/standards/${s.id}/v${v}.md`)
            return file !== null ? v : null
          })
        )).filter((v): v is string => v !== null)
        return changedIn.length > 0 ? { id: s.id, name: s.name, changedIn } : null
      })
    )).filter((r): r is NonNullable<typeof r> => r !== null)

    return { diff, standards: { added, removed, contentModified } }
  }

  /**
   * Resets in-memory BEP and restores .md files to the last committed baseline.
   * Standards added since the baseline have their .md deleted.
   */
  async discard(): Promise<void> {
    const zip = this.getZip()
    const baseline = await this.readBaseline()
    if (!baseline) throw new Error('No baseline found — call commit() first')

    const baseIds = new Set(baseline.standards.map(s => s.id))

    // Delete .md files for standards added since baseline
    for (const standard of this.getBep().standards) {
      if (!baseIds.has(standard.id)) zip.remove(standard.contentPath)
    }

    // Restore .md files for standards that existed at baseline
    for (const standard of baseline.standards) {
      const baseFile = zip.file(`baseline/standards/${standard.id}.md`)
      if (!baseFile) continue
      const content = await baseFile.async('string')
      zip.file(standard.contentPath, content)
    }

    this.setBep(baseline)
  }

  /**
   * Non-destructive revert: restores BEP state and .md files to a historical
   * version and immediately commits it as a new version.
   */
  async revert(version: string, params: CommitParams): Promise<BEPVersion> {
    const zip = this.getZip()
    const historical = await this.get(version)

    // Restore .md content for each standard to its state at target version
    for (const standard of historical.standards) {
      const content = await this.resolveStandardContent(standard, version)
      if (content !== null) zip.file(standard.contentPath, content)
    }

    this.setBep(historical)
    return this.commit(params)
  }

  /**
   * Returns a structured diff of the current BEP state vs the last committed baseline.
   * Includes .md content changes for standards (added, removed, modified, content-modified).
   */
  async status(): Promise<BepStatus> {
    const zip = this.getZip()
    const baseline = await this.readBaseline()
    if (!baseline) return { hasPendingChanges: false, project: null, sections: {}, changedKeys: [], standards: [] }

    const currentBep = this.getBep()
    const diff = diffBep(currentBep, baseline)

    const standards: StandardChange[] = []
    const baseStdMap = new Map(baseline.standards.map(s => [s.id, s]))
    const currStdIds = new Set(currentBep.standards.map(s => s.id))

    for (const s of currentBep.standards) {
      if (!baseStdMap.has(s.id)) {
        standards.push({ id: s.id, name: s.name, status: 'added' })
      } else {
        const jsonChanged = JSON.stringify(baseStdMap.get(s.id)) !== JSON.stringify(s)
        const baseFile = zip.file(`baseline/standards/${s.id}.md`)
        const currFile = zip.file(s.contentPath)
        const baseContent = baseFile ? await baseFile.async('string') : ''
        const currContent = currFile ? await currFile.async('string') : ''
        if (jsonChanged) standards.push({ id: s.id, name: s.name, status: 'modified' })
        else if (baseContent !== currContent) standards.push({ id: s.id, name: s.name, status: 'content-modified' })
      }
    }
    for (const s of baseline.standards) {
      if (!currStdIds.has(s.id)) standards.push({ id: s.id, name: s.name, status: 'removed' })
    }

    const hasPendingChanges = diff.changedKeys.length > 0 || standards.length > 0
    return { hasPendingChanges, standards, ...diff }
  }

  /** Shorthand — true if there are uncommitted changes since the last commit. */
  async hasPendingChanges(): Promise<boolean> {
    return (await this.status()).hasPendingChanges
  }

  /** Returns all versions sorted ascending, with author/approvedBy resolved to { email, name } objects. */
  async listResolved(): Promise<BEPVersionResolved[]> {
    const [versions, current] = await Promise.all([this.list(), this.current()])
    const members = this.getBep().members
    return versions
      .sort((a, b) => History.compareVersions(a.version, b.version))
      .map(v => ({
        version: v.version,
        type: v.type,
        date: v.date,
        description: v.description,
        diff: v.diff,
        isCurrent: v.version === current,
        author: v.author ? { email: v.author, name: members.find(m => m.email === v.author)?.name ?? null } : null,
        ...(v.type === 'version' ? {
          approvedBy: v.approvedBy.map(email => ({
            email,
            name: members.find(m => m.email === email)?.name ?? null,
          })),
        } : {}),
      }))
  }

  /**
   * Resolves the markdown content of a standard at a specific historical version.
   * Returns null if the standard did not exist at that version.
   */
  async getStandardContent(standardId: string, version: string): Promise<string | null> {
    const historical = await this.get(version)
    const standard = historical.standards.find(s => s.id === standardId)
    if (!standard) return null
    return this.resolveStandardContent(standard, version)
  }

  /**
   * ⚠️ Destructive: resets the BEP to a historical version and permanently
   * deletes all subsequent diffs, standard snapshots, and changelog entries.
   */
  async reset(version: string): Promise<void> {
    const zip = this.getZip()
    const changelog = await this.readChangelog()
    if (!changelog) throw new Error('No changelog found')
    const versionInHistory = changelog.versions.find(v => v.version === version)
    const versionFileExists = !!this.getZip().file(`changelog/v${version}.json`)
    if (!versionInHistory && !versionFileExists)
      throw new Error(`Version not found: ${version}`)
    if (version === changelog.current)
      throw new Error(`Already at version ${version}`)

    const toRemove = changelog.versions.filter(v => History.compareVersions(v.version, version) > 0)
    const targetState = await this.get(version)

    // Restore .md files to target version content
    for (const standard of targetState.standards) {
      const content = await this.resolveStandardContent(standard, version)
      if (content !== null) zip.file(standard.contentPath, content)
    }
    await this.snapshotBaseStandards(targetState)

    // Remove diffs and standard snapshots of deleted versions
    for (const v of toRemove) {
      if (v.diff) zip.remove(v.diff)
      Object.keys(zip.files)
        .filter(k => k.startsWith('changelog/standards/') && k.includes(`/v${v.version}.md`))
        .forEach(k => zip.remove(k))
    }

    const targetSnapshot = JSON.stringify(targetState, null, 2)
    zip.file('changelog.json', JSON.stringify({
      current: version,
      versions: changelog.versions.filter(v => History.compareVersions(v.version, version) <= 0),
    } satisfies Changelog, null, 2))
    zip.file('bep.json', targetSnapshot)
    zip.file('baseline/bep.json', targetSnapshot)
    this.setBep(targetState)
  }

  /**
   * ⚠️ Destructive: collapses all history into a single new terminus version.
   * All intermediate diffs and snapshots are permanently deleted.
   * newBase must be in X.0 format and greater than the current version.
   */
  async squash(params: SquashParams): Promise<BEPVersion> {
    const zip = this.getZip()
    const changelog = await this.readChangelog()
    if (!changelog) throw new Error('No changelog found')
    if (!/^\d+\.0$/.test(params.newBase))
      throw new Error(`newBase must be in X.0 format (e.g. "2.0"), got "${params.newBase}"`)
    if (History.compareVersions(params.newBase, changelog.current) <= 0)
      throw new Error(`newBase "${params.newBase}" must be greater than current version "${changelog.current}"`)

    const bep = this.getBep()
    const missing = params.approvedBy.filter(email => !bep.members.some(m => m.email === email))
    if (missing.length) throw new Error(`Members not found: ${missing.join(', ')}`)

    // Remove all existing diffs and the old terminus snapshot
    for (const v of changelog.versions) {
      if (v.diff) zip.remove(v.diff)
    }
    Object.keys(zip.files)
      .filter(k => /^changelog\/v[\d.]+\.json$/.test(k))
      .forEach(k => zip.remove(k))

    // Remove all standard snapshots from changelog
    Object.keys(zip.files)
      .filter(k => k.startsWith('changelog/standards/') && k.endsWith('.md'))
      .forEach(k => zip.remove(k))

    // Create new terminus + standard snapshots at newBase
    zip.file(`changelog/v${params.newBase}.json`, JSON.stringify(bep, null, 2))
    for (const standard of bep.standards) {
      const currentFile = zip.file(standard.contentPath)
      if (!currentFile) continue
      const content = await currentFile.async('string')
      zip.file(`changelog/standards/${standard.id}/v${params.newBase}.md`, content)
    }

    // Sync baseline to current state
    zip.file('baseline/bep.json', JSON.stringify(bep, null, 2))
    await this.snapshotBaseStandards(bep)

    const newEntry: BEPVersion = {
      version: params.newBase,
      type: 'version',
      date: new Date().toISOString(),
      author: params.author,
      description: params.description,
      approvedBy: params.approvedBy,
      diff: null,
    }
    zip.file('changelog.json', JSON.stringify({ current: params.newBase, versions: [newEntry] } satisfies Changelog, null, 2))

    return newEntry
  }
}
