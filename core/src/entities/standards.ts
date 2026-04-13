import type JSZip from 'jszip'
import type { BEP, Standard } from '../types/schema.js'
import { Entity, type BulkResult } from '../base/entity.js'
import { StandardSchema } from '../types/schema.js'

/** Input for Standards.add(): accepts markdown text in `content` instead of a file path. */
export type StandardAddInput = Omit<Standard, 'id' | 'contentPath'> & { content: string }

export class Standards extends Entity<Standard, true> {
  constructor(getBep: () => BEP, private getZip: () => JSZip) {
    super(
      () => getBep().standards,
      getBep,
      { key: 'standards', schema: StandardSchema, autoId: true },
    )
  }

  /**
   * Accepts markdown text in `content` (user-facing).
   * Generates a UUID-based path, writes the text to the zip,
   * and stores the path in Standard.contentPath.
   * Union with AddInput<Standard> satisfies the base class contract.
   */
  override add(inputs: (StandardAddInput | Omit<Standard, 'id'>)[]): BulkResult<Standard> {
    const withPaths = inputs.map(input => {
      const path = `standards/${globalThis.crypto.randomUUID()}.md`
      if ('content' in input) {
        const { content, ...rest } = input
        this.getZip().file(path, content)
        return { ...rest, contentPath: path }
      }
      this.getZip().file(path, '')
      return { ...input, contentPath: path }
    })
    return super.add(withPaths)
  }

  /** Removes standards and deletes their .md files from the zip. */
  override remove(ids: Standard['id'][]) {
    const paths = new Map(
      ids
        .map(id => [id, this.list().find(s => s.id === id)?.contentPath])
        .filter((e): e is [string, string] => e[1] !== undefined),
    )
    const result = super.remove(ids)
    for (const id of result.succeeded) {
      const path = paths.get(id)
      if (path) this.getZip().remove(path)
    }
    return result
  }

  /** Returns the markdown text content of the given standard. */
  async getContent(id: Standard['id']): Promise<string> {
    const std = this.list().find(s => s.id === id)
    if (!std) throw new Error(`Standard not found: ${id}`)
    const file = this.getZip().file(std.contentPath)
    if (!file) throw new Error(`Content file not found: ${std.contentPath}`)
    return file.async('string')
  }

  /** Writes new markdown text content for the given standard. */
  setContent(id: Standard['id'], text: string): void {
    const std = this.list().find(s => s.id === id)
    if (!std) throw new Error(`Standard not found: ${id}`)
    this.getZip().file(std.contentPath, text)
  }
}
