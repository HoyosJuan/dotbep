import type { RaciMatrix, RaciRow } from '../types/resolved.js'

/**
 * Groups RACI rows by an arbitrary key extracted from each row.
 * The keyFn can return a single string or an array of strings — useful for
 * dimensions where a row can belong to multiple groups (e.g. grouping by member).
 */
export function groupRaciRows(
  rows: RaciRow[],
  keyFn: (row: RaciRow) => string | string[],
): { key: string; rows: RaciRow[] }[] {
  const map = new Map<string, RaciRow[]>()

  for (const row of rows) {
    const keys = [keyFn(row)].flat()
    for (const key of keys) {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
  }

  return Array.from(map.entries()).map(([key, rows]) => ({ key, rows }))
}

export type { RaciMatrix, RaciRow }
