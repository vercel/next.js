import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'

/**
 * Checks if a pathname could match an App Router route with a dynamic locale segment
 * at the beginning (e.g., /[lang]/page, /[locale]/blog/[...slug]).
 *
 * This is used to prevent Pages Router i18n from stripping locale prefixes that
 * App Router needs for its dynamic segments.
 *
 * @param pathname The pathname to check (e.g., /nl-NL/test)
 * @param appRoutePatterns Array of App Router route patterns (e.g., ['/[lang]/test', '/[lang]/blog'])
 * @returns true if the pathname could match an App Router route with dynamic locale routing
 */
export function couldMatchAppRouterLocaleRoute(
  pathname: string,
  appRoutePatterns: string[]
): boolean {
  if (!pathname || appRoutePatterns.length === 0) return false

  for (const pattern of appRoutePatterns) {
    // Only check dynamic routes
    if (!isDynamicRoute(pattern)) continue

    // Optimization: only check routes that start with a dynamic segment
    const firstSegment = pattern.split('/').filter(Boolean)[0]
    if (
      !firstSegment ||
      !firstSegment.startsWith('[') ||
      !firstSegment.endsWith(']')
    ) {
      continue
    }

    // Use Next.js's built-in route matcher which handles:
    // - Dynamic segments: [lang]
    // - Catch-all: [...slug]
    // - Optional catch-all: [[...slug]]
    // - Route groups: (group)
    // - Parallel routes: @slot
    // - Intercepting routes: (.)
    try {
      const routeRegex = getRouteRegex(pattern)
      const matcher = getRouteMatcher(routeRegex)

      if (matcher(pathname)) {
        return true
      }
    } catch {
      // If we can't create a matcher for this pattern, skip it
      continue
    }
  }

  return false
}

/**
 * Converts App Router file paths/patterns to route patterns.
 * The input can be either:
 * - File paths: '/app/[lang]/test/page.tsx'
 * - Already-normalized patterns: '/[lang]/test'
 *
 * @param appFilePaths Set of App Router file paths or patterns
 * @returns Array of route patterns
 */
export function getAppRoutePatterns(appFilePaths: Set<string>): string[] {
  const patterns: string[] = []

  for (let filePath of appFilePaths) {
    // Remove file extensions and special files (page.tsx, route.ts, layout.tsx, etc.)
    // These patterns handle both file paths and already-normalized patterns
    let pattern = filePath
      .replace(/\/page(\.(tsx?|jsx?))?$/, '')
      .replace(/\/route(\.(tsx?|jsx?))?$/, '')
      .replace(/\/layout(\.(tsx?|jsx?))?$/, '')
      .replace(/\/loading(\.(tsx?|jsx?))?$/, '')
      .replace(/\/error(\.(tsx?|jsx?))?$/, '')
      .replace(/\/template(\.(tsx?|jsx?))?$/, '')
      .replace(/\/not-found(\.(tsx?|jsx?))?$/, '')
      .replace(/\/default(\.(tsx?|jsx?))?$/, '')

    // If the pattern is empty after stripping, it means it was just "/page.tsx" or similar
    // In that case, use "/" as the pattern
    if (!pattern || pattern === '') {
      pattern = '/'
    }

    // Only include patterns that have a dynamic first segment
    const firstSegment = pattern.split('/').filter(Boolean)[0]
    if (
      firstSegment &&
      firstSegment.startsWith('[') &&
      firstSegment.endsWith(']')
    ) {
      patterns.push(pattern)
    }
  }

  return patterns
}
