import jsonata from 'jsonata'
import type { BEP } from '../types/schema.js'

// ─── Grammar ────────────────────────────────────────────────────────────────
//
// {{ <JSONata expression> }}  — embedded anywhere in text (a standard's
// prose), or as the entire value of a string field (e.g. referenceData.data).
// The expression is evaluated with the raw BEP object as its root context, so
// it reads like real property access: {{teams[id='COO'].name}},
// {{project.name}}, {{deliverableNamingConvention.delimiter}}.
//
// Resolution happens only on read, never persisted (see
// docs/adrs/no-persisted-derivable-data.md). A reference that fails to parse
// or does not resolve to a value is replaced with a visible "⚠" marker,
// never dropped silently — and this can now happen even for a reference that
// was broken from the moment it was written: see
// docs/adrs/no-async-write-time-validation.md for why writes don't validate
// that a reference actually resolves.

const INLINE_REF_RE = /\{\{([^{}]+)\}\}/g

interface Resolution {
  value?: unknown
  error?: string
}

async function evaluateOne(expr: string, bep: BEP): Promise<Resolution> {
  try {
    const value = await jsonata(expr).evaluate(bep)
    if (value === undefined) return { error: `{{${expr}}}: did not resolve to a value` }
    return { value }
  } catch (e) {
    return { error: `{{${expr}}}: ${(e as Error).message}` }
  }
}

/**
 * Resolves every {{...}} reference found within a string. A string that is
 * ENTIRELY one reference (the common case for referenceData.data — e.g.
 * `"{{teams[id='COO'].name}}"`) resolves to the expression's own value,
 * whatever type it is (string, number, object, array). A string with a
 * reference embedded among other text (a standard's prose) has each
 * occurrence replaced in place, stringified.
 */
async function resolveString(s: string, bep: BEP): Promise<unknown> {
  const wholeMatch = /^\{\{([^{}]+)\}\}$/.exec(s)
  if (wholeMatch) {
    const { value, error } = await evaluateOne(wholeMatch[1]!, bep)
    return error ? `⚠ ${error}` : value
  }

  if (!INLINE_REF_RE.test(s)) return s
  INLINE_REF_RE.lastIndex = 0

  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_REF_RE.exec(s))) {
    result += s.slice(lastIndex, match.index)
    const { value, error } = await evaluateOne(match[1]!, bep)
    result += error ? `⚠ ${error}` : (typeof value === 'string' ? value : JSON.stringify(value))
    lastIndex = match.index + match[0].length
  }
  result += s.slice(lastIndex)
  return result
}

async function walk(value: unknown, bep: BEP): Promise<unknown> {
  if (typeof value === 'string') return resolveString(value, bep)
  if (Array.isArray(value)) return Promise.all(value.map(v => walk(v, bep)))
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([k, v]) => [k, await walk(v, bep)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

/**
 * Recursively walks an arbitrary JSON-shaped value (or a plain string, e.g.
 * a standard's whole markdown body), replacing every {{...}} reference with
 * the corresponding live data from `bep`. Never mutates `bep` — resolution is
 * always computed fresh, never persisted.
 *
 * Async because JSONata's evaluate() always returns a Promise (since 2.0.0),
 * even for expressions with no async operations. Never called from a
 * synchronous write-time validation path — see
 * docs/adrs/no-async-write-time-validation.md.
 */
export async function resolveBepRefs(value: unknown, bep: BEP): Promise<unknown> {
  return walk(value, bep)
}

function collectStrings(value: unknown, into: string[]): void {
  if (typeof value === 'string') { into.push(value); return }
  if (Array.isArray(value)) { value.forEach(v => collectStrings(v, into)); return }
  if (value && typeof value === 'object') Object.values(value as object).forEach(v => collectStrings(v, into))
}

/**
 * True if a JSONata expression's AST literally contains both `collection` as
 * a path/name step and `id` as a string literal — a syntactic check, not an
 * evaluation, so it stays synchronous. Deliberately conservative: this can
 * false-positive (an expression that happens to mention the same collection
 * name and id string for an unrelated reason) but never false-negatives on
 * the common case of a direct equality filter (`collection[id='...']` or
 * similar). A false positive only means an unnecessary delete-block, never a
 * missed one — the safe direction to err in.
 */
function exprReferencesEntity(expr: string, collection: string, id: string): boolean {
  let ast: unknown
  try {
    ast = jsonata(expr).ast()
  } catch {
    return false
  }

  let hasCollection = false
  let hasId = false
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n['type'] === 'name' && n['value'] === collection) hasCollection = true
    if (n['type'] === 'string' && n['value'] === id) hasId = true
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(visit)
      else if (v && typeof v === 'object') visit(v)
    }
  }
  visit(ast)
  return hasCollection && hasId
}

/**
 * True if any string within `value` contains a {{...}} reference to the
 * given collection/id. Used to block deleting an entity that something else
 * (e.g. a referenceData node) still points to. Synchronous — parses each
 * reference's syntax tree but never evaluates it (see exprReferencesEntity).
 */
export function referencesEntity(value: unknown, collection: string, id: string): boolean {
  const strings: string[] = []
  collectStrings(value, strings)
  for (const s of strings) {
    for (const match of s.matchAll(INLINE_REF_RE)) {
      if (exprReferencesEntity(match[1]!, collection, id)) return true
    }
  }
  return false
}
