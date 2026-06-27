import type JSZip from 'jszip'
import { ZodError } from 'zod'
import type { Memory } from '../types/schema.js'
import { MemorySchema } from '../types/schema.js'
import type { BulkResult } from '../base/entity.js'

export type MemoryAddInput = Memory & { content: string }
export type MemoryUpdateInput = Partial<Omit<Memory, 'id'>> & { id: string; content?: string }

function errMsg(e: unknown): string {
  if (e instanceof ZodError)
    return e.issues.map(i => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; ')
  return (e as Error).message
}

const INDEX_PATH = 'memories/index.json'

export class Memories {
  private _items: Memory[]

  constructor(
    items: Memory[],
    private getZip: () => JSZip,
  ) {
    this._items = items
  }

  private _flush(): void {
    this.getZip().file(INDEX_PATH, JSON.stringify(this._items, null, 2))
  }

  private _contentPath(id: string): string {
    return `memories/${id}.md`
  }

  list(): Memory[] {
    return this._items
  }

  get(ids: string[]): BulkResult<Memory> {
    const succeeded: Memory[] = []
    const failed: { id: string; error: string }[] = []
    for (const id of ids) {
      const memory = this._items.find(m => m.id === id)
      if (memory) succeeded.push(memory)
      else failed.push({ id, error: `Not found: ${id}` })
    }
    return { succeeded, failed }
  }

  add(inputs: MemoryAddInput[]): BulkResult<Memory> {
    const succeeded: Memory[] = []
    const failed: { id: string; error: string }[] = []
    for (const input of inputs) {
      const { content, ...meta } = input
      try {
        if (this._items.some(m => m.id === meta.id))
          throw new Error(`Duplicate id: ${meta.id}`)
        const memory = MemorySchema.parse(meta)
        this._items.push(memory)
        this.getZip().file(this._contentPath(meta.id), content)
        this._flush()
        succeeded.push(memory)
      } catch (e) {
        failed.push({ id: meta.id, error: errMsg(e) })
      }
    }
    return { succeeded, failed }
  }

  update(patches: MemoryUpdateInput[]): BulkResult<Memory> {
    const succeeded: Memory[] = []
    const failed: { id: string; error: string }[] = []
    for (const patch of patches) {
      const { id, content, ...rest } = patch
      const index = this._items.findIndex(m => m.id === id)
      if (index === -1) {
        failed.push({ id, error: `Not found: ${id}` })
        continue
      }
      try {
        const merged = MemorySchema.parse({ ...this._items[index], ...rest })
        this._items[index] = merged
        if (content !== undefined) this.getZip().file(this._contentPath(id), content)
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
      const index = this._items.findIndex(m => m.id === id)
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
    if (!this._items.some(m => m.id === id)) throw new Error(`Memory not found: ${id}`)
    const file = this.getZip().file(this._contentPath(id))
    if (!file) throw new Error(`Content file not found: memories/${id}.md`)
    return file.async('string')
  }

  setContent(id: string, text: string): void {
    if (!this._items.some(m => m.id === id)) throw new Error(`Memory not found: ${id}`)
    this.getZip().file(this._contentPath(id), text)
  }
}
