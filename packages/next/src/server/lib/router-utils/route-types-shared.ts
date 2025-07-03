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
}: {
  dir: string
  pageRoutes: Array<{ route: string; filePath: string }>
  appRoutes: Array<{ route: string; filePath: string }>
  layoutRoutes: Array<{
    route: string
    filePath: string
    slots?: string[]
  }>
}): RouteTypesManifest {
  const manifest: RouteTypesManifest = {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
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

  return manifest
}
