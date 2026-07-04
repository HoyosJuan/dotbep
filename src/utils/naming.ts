import type { BEP, NamingConvention, NamingToken } from '../types/schema.js'

export const DEFAULT_DELIMITER     = '-'
export const DEFAULT_TOKEN_PATTERN = '^[A-Z0-9]{3}$'

/**
 * Returns the regex pattern for a token from the convention,
 * or the default pattern if not explicitly defined.
 */
export function getTokenPattern(token: NamingToken, convention?: NamingConvention): string {
  if (convention) {
    const seg = convention.segments.find(s => s.type === 'field' && s.token === token)
    if (seg?.type === 'field' && seg.pattern) return seg.pattern
  }
  return DEFAULT_TOKEN_PATTERN
}

/**
 * Validates a token value against the naming convention.
 * Returns an error message if invalid, null if valid.
 *
 * Two independent checks:
 * 1. Value matches the token's pattern (explicit or default).
 * 2. Value does not contain the naming delimiter (always enforced by the core).
 */
export function validateTokenValue(
  token: NamingToken,
  value: string,
  convention?: NamingConvention,
): string | null {
  const delimiter = convention?.delimiter ?? DEFAULT_DELIMITER
  const pattern   = getTokenPattern(token, convention)

  if (!new RegExp(pattern).test(value))
    return `"${value}" does not match naming pattern ${pattern} for token "${token}"`

  if (value.includes(delimiter))
    return `"${value}" contains the naming delimiter "${delimiter}"`

  return null
}

/**
 * Validates all token-bearing entity IDs in a BEP against a naming convention.
 * Used when setting a new convention to ensure all existing data is compatible.
 */
export function validateAllTokens(bep: BEP, convention?: NamingConvention): string[] {
  const errors: string[] = []

  const check = (token: NamingToken, value: string) => {
    const err = validateTokenValue(token, value, convention)
    if (err) errors.push(err)
  }

  check('project', bep.project.code)
  for (const t of bep.teams)       check('team',        t.id)
  for (const d of bep.disciplines) check('discipline',  d.id)
  for (const a of bep.assetTypes)  check('assetType',   a.id)
  for (const n of bep.lbs)         check(n.type === 'zone' ? 'lbsZone' : 'lbsLocation', n.id)

  return errors
}
