/**
 * Client-safe utilities for route matching that don't import server-side
 * utilities to avoid bundling issues with Turbopack
 */

import {
  pathToRegexp,
  compile,
  regexpToFunction,
} from 'next/dist/compiled/path-to-regexp'
import {
  hasAdjacentParameterIssues,
  fixAdjacentParameters,
  stripParameterSeparators,
} from '../../../../lib/path-to-regexp-fixes'

/**
 * Client-safe wrapper around pathToRegexp that handles path-to-regexp 6.3.0+ validation errors.
 * This includes both "Can not repeat without prefix/suffix" and "Must have text between parameters" errors.
 * No server-side error reporting to avoid bundling issues.
 */
export function safePathToRegexp(
  route: string | RegExp | Array<string | RegExp>,
  keys?: any[],
  options?: any
): RegExp {
  // Proactively fix known problematic patterns
  if (typeof route === 'string' && hasAdjacentParameterIssues(route)) {
    const fixedRoute = fixAdjacentParameters(route)
    return pathToRegexp(fixedRoute, keys, options)
  }

  try {
    return pathToRegexp(route, keys, options)
  } catch (error) {
    // For any remaining edge cases, try the fix as fallback
    if (typeof route === 'string') {
      try {
        const fixedRoute = fixAdjacentParameters(route)
        return pathToRegexp(fixedRoute, keys, options)
      } catch (retryError) {
        // If that doesn't work, fall back to original error
        throw error
      }
    }
    throw error
  }
}

/**
 * Client-safe wrapper around compile that handles path-to-regexp 6.3.0+ validation errors.
 * No server-side error reporting to avoid bundling issues.
 */
export function safeCompile(route: string, options?: any) {
  // Proactively fix known problematic patterns
  if (hasAdjacentParameterIssues(route)) {
    const fixedRoute = fixAdjacentParameters(route)
    return compile(fixedRoute, options)
  }

  try {
    return compile(route, options)
  } catch (error) {
    // For any remaining edge cases, try the fix as fallback
    try {
      const fixedRoute = fixAdjacentParameters(route)
      return compile(fixedRoute, options)
    } catch (retryError) {
      // If that doesn't work, fall back to original error
      throw error
    }
  }
}

/**
 * Client-safe wrapper around regexpToFunction that automatically cleans parameters.
 * No server-side error reporting to avoid bundling issues.
 */
export function safeRegexpToFunction<
  T extends Record<string, any> = Record<string, any>,
>(regexp: RegExp, keys?: any[]): (pathname: string) => { params: T } | false {
  const originalMatcher = regexpToFunction<T>(regexp, keys || [])

  return (pathname: string) => {
    const result = originalMatcher(pathname)
    if (!result) return false

    // Clean parameters before returning
    return {
      ...result,
      params: stripParameterSeparators(result.params as any) as T,
    }
  }
}

/**
 * Safe wrapper for route matcher functions that automatically cleans parameters.
 * This is client-safe and doesn't import path-to-regexp.
 */
export function safeRouteMatcher<T extends Record<string, any>>(
  matcherFn: (pathname: string) => false | T
): (pathname: string) => false | T {
  return (pathname: string) => {
    const result = matcherFn(pathname)
    if (!result) return false

    // Clean parameters before returning
    return stripParameterSeparators(result) as T
  }
}
