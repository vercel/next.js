/**
 * Runtime-safe subset of Next's jsconfig/tsconfig path matching logic.
 * Based on the same TypeScript path pattern handling used by the webpack plugin.
 */

export interface Pattern {
  prefix: string
  suffix: string
}

const asterisk = 0x2a

export function hasZeroOrOneAsteriskCharacter(str: string): boolean {
  let seenAsterisk = false
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === asterisk) {
      if (!seenAsterisk) {
        seenAsterisk = true
      } else {
        return false
      }
    }
  }
  return true
}

export function pathIsRelative(testPath: string): boolean {
  return /^\.\.?($|[\\/])/.test(testPath)
}

export function tryParsePattern(pattern: string): Pattern | undefined {
  const indexOfStar = pattern.indexOf('*')
  return indexOfStar === -1
    ? undefined
    : {
        prefix: pattern.slice(0, indexOfStar),
        suffix: pattern.slice(indexOfStar + 1),
      }
}

function isPatternMatch({ prefix, suffix }: Pattern, candidate: string) {
  return (
    candidate.length >= prefix.length + suffix.length &&
    candidate.startsWith(prefix) &&
    candidate.endsWith(suffix)
  )
}

export function findBestPatternMatch<T>(
  values: readonly T[],
  getPattern: (value: T) => Pattern,
  candidate: string
): T | undefined {
  let matchedValue: T | undefined
  let longestMatchPrefixLength = -1

  for (const value of values) {
    const pattern = getPattern(value)
    if (
      isPatternMatch(pattern, candidate) &&
      pattern.prefix.length > longestMatchPrefixLength
    ) {
      longestMatchPrefixLength = pattern.prefix.length
      matchedValue = value
    }
  }

  return matchedValue
}

export function matchPatternOrExact(
  patternStrings: readonly string[],
  candidate: string
): string | Pattern | undefined {
  const patterns: Pattern[] = []
  for (const patternString of patternStrings) {
    if (!hasZeroOrOneAsteriskCharacter(patternString)) continue
    const pattern = tryParsePattern(patternString)
    if (pattern) {
      patterns.push(pattern)
    } else if (patternString === candidate) {
      return patternString
    }
  }

  return findBestPatternMatch(patterns, (_) => _, candidate)
}

export function isString(text: unknown): text is string {
  return typeof text === 'string'
}

export function matchedText(pattern: Pattern, candidate: string): string {
  return candidate.substring(
    pattern.prefix.length,
    candidate.length - pattern.suffix.length
  )
}

export function patternText({ prefix, suffix }: Pattern): string {
  return `${prefix}*${suffix}`
}
