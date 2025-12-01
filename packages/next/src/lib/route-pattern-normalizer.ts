import type { Token } from 'next/dist/compiled/path-to-regexp'

/**
 * Route pattern normalization utilities for path-to-regexp compatibility.
 *
 * path-to-regexp 6.3.0+ introduced stricter validation that rejects certain
 * patterns commonly used in Next.js interception routes. This module provides
 * normalization functions to make Next.js route patterns compatible with the
 * updated library while preserving all functionality.
 */

/**
 * Internal separator used to normalize adjacent parameter patterns.
 * This unique marker is inserted between adjacent parameters and stripped out
 * during parameter extraction to avoid conflicts with real URL content.
 */
export const PARAM_SEPARATOR = '_NEXTSEP_'

/**
 * Detects if a route pattern needs normalization for path-to-regexp compatibility.
 */
export function hasAdjacentParameterIssues(route: string): boolean {
  if (typeof route !== 'string') return false

  // Check for interception route markers followed immediately by parameters
  // Pattern: /(.):param, /(..):param, /(...):param, /(.)(.):param etc.
  // These patterns cause "Must have text between two parameters" errors
  if (/\/\(\.{1,3}\):[^/\s]+/.test(route)) {
    return true
  }

  // Check for basic adjacent parameters without separators
  // Pattern: :param1:param2 (but not :param* or other URL patterns)
  if (/:[a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z_][a-zA-Z0-9_]*/.test(route)) {
    return true
  }

  return false
}

/**
 * Normalizes route patterns that have adjacent parameters without text between them.
 * Inserts a unique separator that can be safely stripped out later.
 */
export function normalizeAdjacentParameters(route: string): string {
  let normalized = route

  // Handle interception route patterns: (.):param -> (.)_NEXTSEP_:param
  normalized = normalized.replace(
    /(\([^)]*\)):([^/\s]+)/g,
    `$1${PARAM_SEPARATOR}:$2`
  )

  // Handle other adjacent parameter patterns: :param1:param2 -> :param1_NEXTSEP_:param2
  normalized = normalized.replace(/:([^:/\s)]+)(?=:)/g, `:$1${PARAM_SEPARATOR}`)

  return normalized
}

/**
 * Normalizes tokens that have repeating modifiers (* or +) but empty prefix and suffix.
 *
 * path-to-regexp 6.3.0+ introduced validation that throws:
 * "Can not repeat without prefix/suffix"
 *
 * This occurs when a token has modifier: '*' or '+' with both prefix: '' and suffix: ''
 */
export function normalizeTokensForRegexp(tokens: Token[]): Token[] {
  return tokens.map((token) => {
    // Token union type: Token = string | TokenObject
    // Literal path segments are strings, parameters/wildcards are objects
    if (
      typeof token === 'object' &&
      token !== null &&
      // Not all token objects have 'modifier' property (e.g., simple text tokens)
      'modifier' in token &&
      // Only repeating modifiers (* or +) cause the validation error
      // Other modifiers like '?' (optional) are fine
      (token.modifier === '*' || token.modifier === '+') &&
      // Token objects can have different shapes depending on route pattern
      'prefix' in token &&
      'suffix' in token &&
      // Both prefix and suffix must be empty strings
      // This is what causes the validation error in path-to-regexp
      token.prefix === '' &&
      token.suffix === ''
    ) {
      // Add minimal prefix to satisfy path-to-regexp validation
      // We use '/' as it's the most common path delimiter and won't break route matching
      // The prefix gets used in regex generation but doesn't affect parameter extraction
      return {
        ...token,
        prefix: '/',
      }
    }
    return token
  })
}

/**
 * Strips normalization separators from compiled pathname.
 * This removes separators that were inserted by normalizeAdjacentParameters
 * to satisfy path-to-regexp validation.
 *
 * Only removes separators in the specific contexts where they were inserted:
 * - After interception route markers: (.)_NEXTSEP_ -> (.)
 *
 * This targeted approach ensures we don't accidentally remove the separator
 * from legitimate user content.
 */
export function stripNormalizedSeparators(pathname: string): string {
  // Remove separator after interception route markers
  // Pattern: (.)_NEXTSEP_ -> (.), (..)_NEXTSEP_ -> (..), etc.
  // The separator appears after the closing paren of interception markers
  return pathname.replace(new RegExp(`\\)${PARAM_SEPARATOR}`, 'g'), ')')
}

/**
 * Strips normalization separators from extracted route parameters.
 * Used by both server and client code to clean up parameters after route matching.
 */
export function stripParameterSeparators(
  params: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Remove the separator if it appears at the start of parameter values
      cleaned[key] = value.replace(new RegExp(`^${PARAM_SEPARATOR}`), '')
    } else if (Array.isArray(value)) {
      // Handle array parameters (from repeated route segments)
      cleaned[key] = value.map((item) =>
        typeof item === 'string'
          ? item.replace(new RegExp(`^${PARAM_SEPARATOR}`), '')
          : item
      )
    } else {
      cleaned[key] = value
    }
  }

  return cleaned
}
