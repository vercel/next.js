import path from 'path'
import {
  getRouteRegex,
  type Group,
} from '../../../shared/lib/router/utils/route-regex'

export interface RouteInfo {
  path: string
  groups: { [groupName: string]: Group }
}

export interface RouteTypesManifest {
  appRoutes: Record<string, RouteInfo>
  pageRoutes: Record<string, RouteInfo>
  layoutRoutes: Record<string, RouteInfo | (RouteInfo & { slots: string[] })>
  /** Map of redirect source => RouteInfo */
  redirectRoutes: Record<string, RouteInfo>
  /** Map of rewrite source => RouteInfo */
  rewriteRoutes: Record<string, RouteInfo>
}

// Convert a custom-route source string (`/blog/:slug`, `/docs/:path*`, ...)
// into the bracket-syntax used by other Next.js route helpers so that we can
// reuse `getRouteRegex()` to extract groups.
export function convertCustomRouteSource(source: string): string {
  // Handle catch-all (one or more / zero or more)  :param* / :param+
  let out = source.replace(
    /:([A-Za-z0-9_]+)\*/g,
    (_m: string, name: string) => `[...${name}]`
  )
  out = out.replace(
    /:([A-Za-z0-9_]+)\+/g,
    (_m: string, name: string) => `[...${name}]`
  )
  // Optional catch-all  :param?
  out = out.replace(
    /:([A-Za-z0-9_]+)\?/g,
    (_m: string, name: string) => `[[...${name}]]`
  )
  // Standard dynamic segment :param (ensure we don't convert already replaced ones)
  out = out.replace(
    /:([A-Za-z0-9_]+)/g,
    (_m: string, name: string) => `[${name}]`
  )
  // Ensure leading slash
  if (!out.startsWith('/')) out = '/' + out
  return out
}

/**
 * Extracts route parameters from a route pattern
 */
export function extractRouteParams(route: string) {
  const regex = getRouteRegex(route)
  return regex.groups
}

/**
 * Determines if a route should be skipped during type generation
 */
export function shouldSkipRoute(filePath: string): boolean {
  return (
    filePath.includes('(..)') ||
    filePath.includes('(.)') ||
    filePath.includes('(...)') ||
    filePath.includes('@')
  )
}

/**
 * Creates a layout file regex for the given page extensions
 */
export function createLayoutFileRegex(pageExtensions: string[]): RegExp {
  const getExtensionRegexString = (extensions: string[]) =>
    `(?:${extensions.join('|')})`
  return new RegExp(
    `[\\\\/]layout\\.${getExtensionRegexString(pageExtensions)}$`
  )
}

/**
 * Extracts parallel route slot information from a normalized page name
 */
export function extractSlotFromPageName(normalizedPageName: string): {
  parentPath: string
  slotName: string
} | null {
  const slotMatch = normalizedPageName.match(/^(.*)\/(@[^/]+)\//)
  if (slotMatch) {
    const parentPath = slotMatch[1] || '/'
    const slotName = slotMatch[2].substring(1) // Remove '@' prefix
    return { parentPath, slotName }
  }
  return null
}

/**
 * Creates a route info object with path and groups
 */
export function createRouteInfo(
  route: string,
  filePath: string,
  baseDir: string
): RouteInfo {
  return {
    path: path.relative(baseDir, filePath),
    groups: extractRouteParams(route),
  }
}

/**
 * Creates a unified route types manifest from processed route data
 */
export function createUnifiedRouteTypesManifest({
  dir,
  pageRoutes,
  appRoutes,
  layoutRoutes,
  redirects,
  rewrites,
}: {
  dir: string
  pageRoutes: Array<{ route: string; filePath: string }>
  appRoutes: Array<{ route: string; filePath: string }>
  layoutRoutes: Array<{
    route: string
    filePath: string
    slots?: string[]
  }>
  redirects?: Array<{ source: string }>
  rewrites?: {
    beforeFiles: Array<{ source: string }>
    afterFiles: Array<{ source: string }>
    fallback: Array<{ source: string }>
  }
}): RouteTypesManifest {
  const manifest: RouteTypesManifest = {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    redirectRoutes: {},
    rewriteRoutes: {},
  }

  // Process page routes
  for (const { route, filePath } of pageRoutes) {
    if (shouldSkipRoute(filePath)) continue
    manifest.pageRoutes[route] = createRouteInfo(route, filePath, dir)
  }

  // Process app routes
  for (const { route, filePath } of appRoutes) {
    if (shouldSkipRoute(filePath)) continue
    manifest.appRoutes[route] = createRouteInfo(route, filePath, dir)
  }

  // Process layout routes
  for (const { route, filePath, slots } of layoutRoutes) {
    if (shouldSkipRoute(filePath)) continue
    const routeInfo = createRouteInfo(route, filePath, dir)

    if (slots && slots.length > 0) {
      manifest.layoutRoutes[route] = {
        ...routeInfo,
        slots: slots.sort(),
      }
    } else {
      manifest.layoutRoutes[route] = routeInfo
    }
  }

  // Process redirect routes
  for (const r of redirects || []) {
    const route = convertCustomRouteSource(r.source)
    manifest.redirectRoutes[route] = {
      path: 'redirect',
      groups: extractRouteParams(route),
    }
  }

  // Process rewrite routes (we only care about source)
  const rewriteArrays = [
    ...(rewrites?.beforeFiles || []),
    ...(rewrites?.afterFiles || []),
    ...(rewrites?.fallback || []),
  ]
  for (const w of rewriteArrays) {
    const route = convertCustomRouteSource(w.source)
    manifest.rewriteRoutes[route] = {
      path: 'rewrite',
      groups: extractRouteParams(route),
    }
  }

  return manifest
}
