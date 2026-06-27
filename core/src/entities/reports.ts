import type JSZip from 'jszip'
import { ZodError } from 'zod'
import type { BEP, Report } from '../types/schema.js'
import { ReportSchema } from '../types/schema.js'
import type { BulkResult } from '../base/entity.js'

export type ReportAddInput = Omit<Report, 'id'> & { content: string }
export type ReportUpdateInput = Partial<Omit<Report, 'id'>> & { id: string }

function errMsg(e: unknown): string {
  if (e instanceof ZodError)
    return e.issues.map(i => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; ')
  return (e as Error).message
}

const INDEX_PATH = 'reports/index.json'

export class Reports {
  private _items: Report[]

  constructor(
    items: Report[],
    private getBep: () => BEP,
    private getZip: () => JSZip,
  ) {
    this._items = items
  }

  private _flush(): void {
    this.getZip().file(INDEX_PATH, JSON.stringify(this._items, null, 2))
  }

  private _contentPath(id: string): string {
    return `reports/${id}.md`
  }

  list(): Report[] {
    return this._items
  }

  get(ids: string[]): BulkResult<Report> {
    const succeeded: Report[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of ids) {
      const report = this._items.find(r => r.id === id)
      if (report) succeeded.push(report)
      else failed.push({ id, error: `Not found: ${id}` })
    }
    return { succeeded, failed }
  }

  add(inputs: ReportAddInput[]): BulkResult<Report> {
    const succeeded: Report[] = []
    const failed: { id: string; error: string }[] = []
    for (const input of inputs) {
      const id = globalThis.crypto.randomUUID()
      try {
        const { content, ...meta } = input
        if (!this.getBep().members.some(m => m.email === meta.author))
          throw new Error(`Member not found: ${meta.author}`)
        const report = ReportSchema.parse({ ...meta, id })
        this._items.push(report)
        this.getZip().file(this._contentPath(id), content)
        this._flush()
        succeeded.push(report)
      } catch (e) {
        failed.push({ id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }

  update(patches: ReportUpdateInput[]): BulkResult<Report> {
    const succeeded: Report[] = []
    const failed: { id: string; error: string }[] = []
    for (const patch of patches) {
      const { id } = patch
      const index = this._items.findIndex(r => r.id === id)
      if (index === -1) {
        failed.push({ id, error: `Not found: ${id}` })
        continue
      }
      try {
        if (patch.author && !this.getBep().members.some(m => m.email === patch.author))
          throw new Error(`Member not found: ${patch.author}`)
        const merged = ReportSchema.parse({ ...this._items[index], ...patch })
        this._items[index] = merged
        this._flush()
        succeeded.push(merged)
      } catch (e) {
        failed.push({ id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }

  remove(ids: string[]): BulkResult<string> {
    const succeeded: string[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of ids) {
      const index = this._items.findIndex(r => r.id === id)
      if (index === -1) {
        failed.push({ id, error: `Not found: ${id}` })
        continue
      }
      this._items.splice(index, 1)
      this.getZip().remove(this._contentPath(id))
      this._flush()
      succeeded.push(id)
    }
    return { succeeded, failed }
  }

  async getContent(id: string): Promise<string> {
    if (!this._items.some(r => r.id === id)) throw new Error(`Report not found: ${id}`)
    const file = this.getZip().file(this._contentPath(id))
    if (!file) throw new Error(`Content file not found: reports/${id}.md`)
    return file.async('string')
  }

  setContent(id: string, text: string): void {
    if (!this._items.some(r => r.id === id)) throw new Error(`Report not found: ${id}`)
    this.getZip().file(this._contentPath(id), text)
  }
}
