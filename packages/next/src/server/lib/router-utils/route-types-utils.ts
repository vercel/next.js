import path from 'path'
import {
  getRouteRegex,
  type Group,
} from '../../../shared/lib/router/utils/route-regex'
import type { NextConfigComplete } from '../../config-shared'
import { isParallelRouteSegment } from '../../../shared/lib/segment'
import { mkdir } from 'fs/promises'
import fs from 'fs'
import { generateRouteTypesFile } from './typegen'

interface RouteInfo {
  path: string
  groups: { [groupName: string]: Group }
}

export interface RouteTypesManifest {
  appRoutes: Record<string, RouteInfo>
  pageRoutes: Record<string, RouteInfo>
  layoutRoutes: Record<string, RouteInfo & { slots: string[] }>
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

function isCanonicalRoute(route: string) {
  const segments = route.split('/')
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]

    if (
      isParallelRouteSegment(segment) ||
      segment.startsWith('(.)') ||
      segment.startsWith('(..)') ||
      segment.startsWith('(...)')
    ) {
      return false
    }
  }

  return true
}

/**
 * Creates a route types manifest from processed route data
 * (used for both build and dev)
 */
export async function createRouteTypesManifest({
  dir,
  pageRoutes,
  appRoutes,
  layoutRoutes,
  slots,
  redirects,
  rewrites,
}: {
  dir: string
  pageRoutes: Array<{ route: string; filePath: string }>
  appRoutes: Array<{ route: string; filePath: string }>
  layoutRoutes: Array<{ route: string; filePath: string }>
  slots: Array<{ name: string; parent: string }>
  redirects?: NextConfigComplete['redirects']
  rewrites?: NextConfigComplete['rewrites']
}): Promise<RouteTypesManifest> {
  const manifest: RouteTypesManifest = {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    redirectRoutes: {},
    rewriteRoutes: {},
  }

  // Process page routes
  for (const { route, filePath } of pageRoutes) {
    manifest.pageRoutes[route] = {
      path: path.relative(dir, filePath),
      groups: extractRouteParams(route),
    }
  }

  // Process layout routes
  for (const { route, filePath } of layoutRoutes) {
    if (!isCanonicalRoute(route)) continue

    manifest.layoutRoutes[route] = {
      path: path.relative(dir, filePath),
      groups: extractRouteParams(route),
      slots: [],
    }
  }

  // Process slots
  for (const slot of slots) {
    manifest.layoutRoutes[slot.parent].slots.push(slot.name)
  }

  // Process app routes
  for (const { route, filePath } of appRoutes) {
    if (!isCanonicalRoute(route)) continue

    manifest.appRoutes[route] = {
      path: path.relative(dir, filePath),
      groups: extractRouteParams(route),
    }
  }

  // Process redirects
  if (typeof redirects === 'function') {
    const rd = await redirects()

    for (const item of rd) {
      const source = convertCustomRouteSource(item.source)
      manifest.redirectRoutes[source] = {
        path: path.relative(dir, source),
        groups: extractRouteParams(source),
      }
    }
  }

  // Process rewrites
  if (typeof rewrites === 'function') {
    const rw = await rewrites()

    const allSources = Array.isArray(rw)
      ? rw
      : [
          ...(rw?.beforeFiles || []),
          ...(rw?.afterFiles || []),
          ...(rw?.fallback || []),
        ]

    for (const item of allSources) {
      const source = convertCustomRouteSource(item.source)
      manifest.rewriteRoutes[source] = {
        path: path.relative(dir, source),
        groups: extractRouteParams(source),
      }
    }
  }

  return manifest
}

export async function writeRouteTypesManifest(
  manifest: RouteTypesManifest,
  filePath: string
) {
  const dirname = path.dirname(filePath)

  if (!fs.existsSync(dirname)) {
    await mkdir(dirname, { recursive: true })
  }

  await fs.promises.writeFile(filePath, generateRouteTypesFile(manifest))
}
