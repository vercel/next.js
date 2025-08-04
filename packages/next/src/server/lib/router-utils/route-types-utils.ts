import path from 'path'
import {
  getRouteRegex,
  type Group,
} from '../../../shared/lib/router/utils/route-regex'
import type { NextConfigComplete } from '../../config-shared'
import { isParallelRouteSegment } from '../../../shared/lib/segment'
import fs from 'fs'
import { generateRouteTypesFile } from './typegen'
import { tryToParsePath } from '../../../lib/try-to-parse-path'

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
  const parseResult = tryToParsePath(source)

  if (parseResult.error || !parseResult.tokens) {
    // Fallback to original source if parsing fails
    return source.startsWith('/') ? source : '/' + source
  }

  let result = ''

  for (const token of parseResult.tokens) {
    if (typeof token === 'string') {
      // Literal path segment
      result += token
    } else {
      // Parameter token
      const { name, modifier, prefix } = token

      // Add the prefix (usually '/')
      result += prefix

      if (modifier === '*') {
        // Catch-all zero or more: :param* -> [[...param]]
        result += `[[...${name}]]`
      } else if (modifier === '+') {
        // Catch-all one or more: :param+ -> [...param]
        result += `[...${name}]`
      } else if (modifier === '?') {
        // Optional catch-all: :param? -> [[...param]]
        result += `[[...${name}]]`
      } else {
        // Standard dynamic segment: :param -> [param]
        result += `[${name}]`
      }
    }
  }

  // Ensure leading slash
  if (!result.startsWith('/')) result = '/' + result
  return result
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
    if (manifest.layoutRoutes[slot.parent]) {
      manifest.layoutRoutes[slot.parent].slots.push(slot.name)
    }
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
        path: source,
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
        path: source,
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
    await fs.promises.mkdir(dirname, { recursive: true })
  }

  await fs.promises.writeFile(filePath, generateRouteTypesFile(manifest))
}
