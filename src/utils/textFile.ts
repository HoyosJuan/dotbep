import type JSZip from 'jszip'

/**
 * Thin wrapper over a plain text file stored in the .bep zip.
 * Used for memory.md and skill.md — files that are not part of bep.json
 * but live in the zip and need to be readable and writable from the core.
 */
export class TextFile {
  constructor(
    private path: string,
    private getZip: () => JSZip,
  ) {}

  /** Returns the file content, or an empty string if the file doesn't exist. */
  async get(): Promise<string> {
    const file = this.getZip().file(this.path)
    return file ? file.async('string') : ''
  }

  /** Writes content to the file, creating it if it doesn't exist. */
  set(content: string): void {
    this.getZip().file(this.path, content)
  }
}
