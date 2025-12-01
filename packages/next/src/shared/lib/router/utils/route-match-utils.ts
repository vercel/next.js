/**
 * Client-safe utilities for route matching that don't import server-side
 * utilities to avoid bundling issues with Turbopack
 */

import type {
  Key,
  TokensToRegexpOptions,
  ParseOptions,
  TokensToFunctionOptions,
} from 'next/dist/compiled/path-to-regexp'
import {
  pathToRegexp,
  compile,
  regexpToFunction,
} from 'next/dist/compiled/path-to-regexp'
import {
  hasAdjacentParameterIssues,
  normalizeAdjacentParameters,
  stripParameterSeparators,
  stripNormalizedSeparators,
} from '../../../../lib/route-pattern-normalizer'

/**
 * Client-safe wrapper around pathToRegexp that handles path-to-regexp 6.3.0+ validation errors.
 * This includes both "Can not repeat without prefix/suffix" and "Must have text between parameters" errors.
 */
export function safePathToRegexp(
  route: string | RegExp | Array<string | RegExp>,
  keys?: Key[],
  options?: TokensToRegexpOptions & ParseOptions
): RegExp {
  if (typeof route !== 'string') {
    return pathToRegexp(route, keys, options)
  }

  // Check if normalization is needed and cache the result
  const needsNormalization = hasAdjacentParameterIssues(route)
  const routeToUse = needsNormalization
    ? normalizeAdjacentParameters(route)
    : route

  try {
    return pathToRegexp(routeToUse, keys, options)
  } catch (error) {
    // Only try normalization if we haven't already normalized
    if (!needsNormalization) {
      try {
        const normalizedRoute = normalizeAdjacentParameters(route)
        return pathToRegexp(normalizedRoute, keys, options)
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
 * When normalization is applied, the returned compiler function automatically strips
 * the internal separator from the output URL.
 */
export function safeCompile(
  route: string,
  options?: TokensToFunctionOptions & ParseOptions
) {
  // Check if normalization is needed and cache the result
  const needsNormalization = hasAdjacentParameterIssues(route)
  const routeToUse = needsNormalization
    ? normalizeAdjacentParameters(route)
    : route

  try {
    const compiler = compile(routeToUse, options)

    // If we normalized the route, wrap the compiler to strip separators from output
    // The normalization inserts _NEXTSEP_ as a literal string in the pattern to satisfy
    // path-to-regexp validation, but we don't want it in the final compiled URL
    if (needsNormalization) {
      return (params: any) => {
        return stripNormalizedSeparators(compiler(params))
      }
    }

    return compiler
  } catch (error) {
    // Only try normalization if we haven't already normalized
    if (!needsNormalization) {
      try {
        const normalizedRoute = normalizeAdjacentParameters(route)
        const compiler = compile(normalizedRoute, options)

        // Wrap the compiler to strip separators from output
        return (params: any) => {
          return stripNormalizedSeparators(compiler(params))
        }
      } catch (retryError) {
        // If that doesn't work, fall back to original error
        throw error
      }
    }
    throw error
  }
}

/**
 * Client-safe wrapper around regexpToFunction that automatically cleans parameters.
 */
export function safeRegexpToFunction<
  T extends Record<string, any> = Record<string, any>,
>(regexp: RegExp, keys?: Key[]): (pathname: string) => { params: T } | false {
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
