import type { Token } from 'next/dist/compiled/path-to-regexp'

/**
 * Core utilities for handling path-to-regexp 6.3.0+ validation issues.
 * This file contains pure functions with no side effects that can be safely
 * shared between server and client code.
 */

/**
 * Internal separator used to fix adjacent parameter validation issues in path-to-regexp 6.3.0+.
 * This marker is inserted between adjacent parameters and stripped out during parameter extraction.
 */
const PARAM_SEPARATOR = '_NEXTSEP_'

/**
 * Detects if a route pattern has issues that would cause path-to-regexp 6.3.0+ validation to fail
 */
export function hasAdjacentParameterIssues(route: string): boolean {
  if (typeof route !== 'string') return false

  // Only check for actual interception route markers at the start of path segments
  // Pattern: /(.):param, /(..):param, /(...):param, /(.)(.):param etc.
  // This specifically looks for patterns that start with a slash and parentheses
  if (/\/\(\.{1,3}\):[^/\s]+/.test(route)) {
    return true
  }

  // Be extremely specific about adjacent parameters - only detect cases where
  // parameters are literally adjacent with no separators between them
  // This should only match patterns like ":param1:param2" but not ":param*" or URL patterns
  if (/:[a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z_][a-zA-Z0-9_]*/.test(route)) {
    return true
  }

  return false
}

/**
 * Fixes route patterns that have adjacent parameters without text between them.
 * This is needed to work around path-to-regexp 6.3.0+ validation.
 * We use a special marker that can be stripped out later to avoid parameter pollution.
 */
export function fixAdjacentParameters(route: string): string {
  let fixed = route

  // The issue is (.):param - add our special separator
  fixed = fixed.replace(/(\([^)]*\)):([^/\s]+)/g, `$1${PARAM_SEPARATOR}:$2`)

  // Handle other basic adjacent parameter patterns conservatively
  fixed = fixed.replace(/:([^:/\s)]+)(?=:)/g, `:$1${PARAM_SEPARATOR}`)

  return fixed
}

/**
 * Fixes tokens that have repeating modifiers (* or +) but empty prefix and suffix.
 * This is needed to work around path-to-regexp 6.3.0+ which doesn't allow such tokens.
 *
 * Path-to-regexp 6.3.0+ introduced validation that throws:
 * "Can not repeat without prefix/suffix"
 *
 * This occurs when a token has modifier: '*' or '+' with both prefix: '' and suffix: ''
 */
export function fixTokensForRegexp(tokens: Token[]): Token[] {
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
      // This is what will cause a backtracking error in path-to-regexp
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
 * Strips the special parameter separator from extracted route parameters.
 * This is used by both server and client code to clean parameters.
 */
export function stripParameterSeparators(
  params: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Remove the separator if it appears at the start of parameter values
      cleaned[key] = value.replace(new RegExp(`^${PARAM_SEPARATOR}`), '')
    } else {
      cleaned[key] = value
    }
  }

  return cleaned
}
