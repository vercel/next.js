import path from 'path'
import {
  getRouteRegex,
  type Group,
} from '../../../shared/lib/router/utils/route-regex'
import type { NextConfigComplete } from '../../config-shared'

import fs from 'fs'
import {
  generateRouteTypesFile,
  generateLinkTypesFile,
  generateValidatorFile,
  generateValidatorFileStrict,
  generateRouteTypesFileStrict,
} from './typegen'
import {
  writeRootParamsTypes,
  type RootParamKind,
} from './root-params-type-utils'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import { tryToParsePath } from '../../../lib/try-to-parse-path'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
} from '../../../shared/lib/router/utils/interception-routes'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE,
} from '../../../shared/lib/entry-constants'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import type { RouteInfo, SlotInfo } from '../../../build/file-classifier'

// Internal route info with extracted params for the manifest
interface ManifestRouteInfo {
  path: string
  groups: { [groupName: string]: Group }
}

export interface RouteTypesManifest {
  appRoutes: Record<string, ManifestRouteInfo>
  pageRoutes: Record<string, ManifestRouteInfo>
  layoutRoutes: Record<string, ManifestRouteInfo & { slots: string[] }>
  appRouteHandlerRoutes: Record<string, ManifestRouteInfo>
  /** Map of redirect source => ManifestRouteInfo */
  redirectRoutes: Record<string, ManifestRouteInfo>
  /** Map of rewrite source => ManifestRouteInfo */
  rewriteRoutes: Record<string, ManifestRouteInfo>
  /** File paths for validation */
  appPagePaths: Set<string>
  pagesRouterPagePaths: Set<string>
  layoutPaths: Set<string>
  appRouteHandlers: Set<string>
  pageApiRoutes: Set<string>
  /** Direct mapping from file paths to routes for validation */
  filePathToRoute: Map<string, string>
  /** Root params collected from root layouts for generating root-params.d.ts */
  rootParams?: Map<string, RootParamKind>
}

// Convert a custom-route source string (`/blog/:slug`, `/docs/:path*`, ...)
// into the bracket-syntax used by other Next.js route helpers so that we can
// reuse `getRouteRegex()` to extract groups.
export function convertCustomRouteSource(source: string): string[] {
  const parseResult = tryToParsePath(source)

  if (parseResult.error || !parseResult.tokens) {
    // Fallback to original source if parsing fails
    return source.startsWith('/') ? [source] : ['/' + source]
  }

  const possibleNormalizedRoutes = ['']
  let slugCnt = 1

  function append(suffix: string) {
    for (let i = 0; i < possibleNormalizedRoutes.length; i++) {
      possibleNormalizedRoutes[i] += suffix
    }
  }

  function fork(suffix: string) {
    const currentLength = possibleNormalizedRoutes.length
    for (let i = 0; i < currentLength; i++) {
      possibleNormalizedRoutes.push(possibleNormalizedRoutes[i] + suffix)
    }
  }

  for (const token of parseResult.tokens) {
    if (typeof token === 'object') {
      // Make sure the slug is always named.
      const slug = token.name || (slugCnt++ === 1 ? 'slug' : `slug${slugCnt}`)
      if (token.modifier === '*') {
        append(`${token.prefix}[[...${slug}]]`)
      } else if (token.modifier === '+') {
        append(`${token.prefix}[...${slug}]`)
      } else if (token.modifier === '') {
        if (token.pattern === '[^\\/#\\?]+?') {
          // A safe slug
          append(`${token.prefix}[${slug}]`)
        } else if (token.pattern === '.*') {
          // An optional catch-all slug
          append(`${token.prefix}[[...${slug}]]`)
        } else if (token.pattern === '.+') {
          // A catch-all slug
          append(`${token.prefix}[...${slug}]`)
        } else {
          // Other regex patterns are not supported. Skip this route.
          return []
        }
      } else if (token.modifier === '?') {
        if (/^[a-zA-Z0-9_/]*$/.test(token.pattern)) {
          // An optional slug with plain text only, fork the route.
          append(token.prefix)
          fork(token.pattern)
        } else {
          // Optional modifier `?` and regex patterns are not supported.
          return []
        }
      }
    } else if (typeof token === 'string') {
      append(token)
    }
  }

  // Ensure leading slash
  return possibleNormalizedRoutes.map((route) =>
    route.startsWith('/') ? route : '/' + route
  )
}

/**
 * Extracts route parameters from a route pattern
 */
export function extractRouteParams(route: string) {
  const regex = getRouteRegex(route)
  return regex.groups
}

/**
 * Resolves an intercepting route to its canonical equivalent
 * Example: /gallery/test/(..)photo/[id] -> /gallery/photo/[id]
 */
function resolveInterceptingRoute(route: string): string {
  // Reuse centralized interception route normalization logic
  try {
    if (!isInterceptionRouteAppPath(route)) return route
    const { interceptedRoute } = extractInterceptionRouteInformation(route)
    return interceptedRoute
  } catch {
    // If parsing fails, fall back to the original route
    return route
  }
}

/**
 * Identifies root layouts and collects their dynamic segments as root params.
 * A root layout is the shallowest layout in each branch of the app directory.
 */
function collectRootParamsFromLayouts(
  layoutRoutes: RouteInfo[]
): Map<string, RootParamKind> {
  const rootParams = new Map<string, RootParamKind>()

  // Sort by depth (fewer path segments = shallower = more likely to be root)
  const sorted = [...layoutRoutes].sort(
    (a, b) => a.route.split('/').length - b.route.split('/').length
  )

  const rootLayoutRoutes: string[] = []

  for (const { route } of sorted) {
    // Skip internal routes
    if (
      route === UNDERSCORE_GLOBAL_ERROR_ROUTE ||
      route === UNDERSCORE_NOT_FOUND_ROUTE
    ) {
      continue
    }

    // A layout is a root layout if no already-found root layout is an ancestor of it
    const hasAncestorRootLayout = rootLayoutRoutes.some((rootRoute) =>
      rootRoute === '/' ? route !== '/' : route.startsWith(rootRoute + '/')
    )

    if (hasAncestorRootLayout) continue

    rootLayoutRoutes.push(route)

    // Extract dynamic segments from this root layout's route
    for (const segment of route.split('/')) {
      const param = getSegmentParam(segment)
      if (param === null) continue

      const kind: RootParamKind =
        param.paramType === 'optional-catchall'
          ? 'optional-catchall'
          : param.paramType === 'catchall'
            ? 'catchall'
            : 'dynamic'

      // If the same param name appears in multiple root layouts with different
      // kinds, keep the most permissive type.
      const existing = rootParams.get(param.paramName)
      if (
        !existing ||
        kind === 'optional-catchall' ||
        (kind === 'catchall' && existing === 'dynamic')
      ) {
        rootParams.set(param.paramName, kind)
      }
    }
  }

  return rootParams
}

/**
 * Creates a route types manifest from processed route data
 * (used for both build and dev)
 */
export async function createRouteTypesManifest({
  dir,
  pageRoutes,
  appRoutes,
  appRouteHandlers,
  pageApiRoutes,
  layoutRoutes,
  slots,
  redirects,
  rewrites,
  validatorFilePath,
}: {
  dir: string
  pageRoutes: RouteInfo[]
  appRoutes: RouteInfo[]
  appRouteHandlers: RouteInfo[]
  pageApiRoutes: RouteInfo[]
  layoutRoutes: RouteInfo[]
  slots: SlotInfo[]
  redirects?: NextConfigComplete['redirects']
  rewrites?: NextConfigComplete['rewrites']
  validatorFilePath?: string
}): Promise<RouteTypesManifest> {
  // Helper function to calculate the correct relative path
  const getRelativePath = (filePath: string) => {
    if (validatorFilePath) {
      // For validator generation, calculate path relative to validator directory
      return normalizePathSep(
        path.relative(path.dirname(validatorFilePath), filePath)
      )
    }
    // For other uses, calculate path relative to project directory
    return normalizePathSep(path.relative(dir, filePath))
  }

  const manifest: RouteTypesManifest = {
    appRoutes: {},
    pageRoutes: {},
    layoutRoutes: {},
    appRouteHandlerRoutes: {},
    redirectRoutes: {},
    rewriteRoutes: {},
    appRouteHandlers: new Set(
      appRouteHandlers.map(({ filePath }) => getRelativePath(filePath))
    ),
    pageApiRoutes: new Set(
      pageApiRoutes.map(({ filePath }) => getRelativePath(filePath))
    ),
    appPagePaths: new Set(
      appRoutes.map(({ filePath }) => getRelativePath(filePath))
    ),
    pagesRouterPagePaths: new Set(
      pageRoutes.map(({ filePath }) => getRelativePath(filePath))
    ),
    layoutPaths: new Set(
      layoutRoutes.map(({ filePath }) => getRelativePath(filePath))
    ),
    filePathToRoute: new Map([
      ...appRoutes.map(
        ({ route, filePath }) =>
          [getRelativePath(filePath), resolveInterceptingRoute(route)] as [
            string,
            string,
          ]
      ),
      ...layoutRoutes.map(
        ({ route, filePath }) =>
          [getRelativePath(filePath), resolveInterceptingRoute(route)] as [
            string,
            string,
          ]
      ),
      ...appRouteHandlers.map(
        ({ route, filePath }) =>
          [getRelativePath(filePath), resolveInterceptingRoute(route)] as [
            string,
            string,
          ]
      ),
      ...pageRoutes.map(
        ({ route, filePath }) =>
          [getRelativePath(filePath), route] as [string, string]
      ),
      ...pageApiRoutes.map(
        ({ route, filePath }) =>
          [getRelativePath(filePath), route] as [string, string]
      ),
    ]),
  }

  // Process page routes
  for (const { route, filePath } of pageRoutes) {
    manifest.pageRoutes[route] = {
      path: getRelativePath(filePath),
      groups: extractRouteParams(route),
    }
  }

  // Process layout routes (exclude internal app error/not-found layouts)
  for (const { route, filePath } of layoutRoutes) {
    if (
      route === UNDERSCORE_GLOBAL_ERROR_ROUTE ||
      route === UNDERSCORE_NOT_FOUND_ROUTE
    )
      continue
    // Use the resolved route (for interception routes, this gives us the canonical route)
    const resolvedRoute = resolveInterceptingRoute(route)
    if (!manifest.layoutRoutes[resolvedRoute]) {
      manifest.layoutRoutes[resolvedRoute] = {
        path: getRelativePath(filePath),
        groups: extractRouteParams(resolvedRoute),
        slots: [],
      }
    }
  }

  // Process slots
  for (const slot of slots) {
    if (manifest.layoutRoutes[slot.parent]) {
      manifest.layoutRoutes[slot.parent].slots.push(slot.name)
    }
  }

  // Process app routes (exclude internal app routes)
  for (const { route, filePath } of appRoutes) {
    if (
      route === UNDERSCORE_GLOBAL_ERROR_ROUTE ||
      route === UNDERSCORE_NOT_FOUND_ROUTE
    )
      continue
    // Don't include metadata routes or pages
    if (
      !filePath.endsWith('page.ts') &&
      !filePath.endsWith('page.tsx') &&
      !filePath.endsWith('.mdx') &&
      !filePath.endsWith('.md')
    ) {
      continue
    }

    // Use the resolved route (for interception routes, this gives us the canonical route)
    const resolvedRoute = resolveInterceptingRoute(route)

    if (!manifest.appRoutes[resolvedRoute]) {
      manifest.appRoutes[resolvedRoute] = {
        path: getRelativePath(filePath),
        groups: extractRouteParams(resolvedRoute),
      }
    }
  }

  // Process app route handlers
  for (const { route, filePath } of appRouteHandlers) {
    // Use the resolved route (for interception routes, this gives us the canonical route)
    const resolvedRoute = resolveInterceptingRoute(route)

    if (!manifest.appRouteHandlerRoutes[resolvedRoute]) {
      manifest.appRouteHandlerRoutes[resolvedRoute] = {
        path: getRelativePath(filePath),
        groups: extractRouteParams(resolvedRoute),
      }
    }
  }

  // Process redirects
  if (typeof redirects === 'function') {
    const rd = await redirects()

    for (const item of rd) {
      const possibleRoutes = convertCustomRouteSource(item.source)
      for (const route of possibleRoutes) {
        manifest.redirectRoutes[route] = {
          path: route,
          groups: extractRouteParams(route),
        }
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
      const possibleRoutes = convertCustomRouteSource(item.source)
      for (const route of possibleRoutes) {
        manifest.rewriteRoutes[route] = {
          path: route,
          groups: extractRouteParams(route),
        }
      }
    }
  }

  manifest.rootParams = collectRootParamsFromLayouts(layoutRoutes)

  return manifest
}

export async function writeRouteTypesManifest(
  manifest: RouteTypesManifest,
  filePath: string,
  config: NextConfigComplete
) {
  const dirname = path.dirname(filePath)

  if (!fs.existsSync(dirname)) {
    await fs.promises.mkdir(dirname, { recursive: true })
  }

  // Write the main routes.d.ts file
  await fs.promises.writeFile(
    filePath,
    config.experimental.strictRouteTypes
      ? generateRouteTypesFileStrict(manifest)
      : generateRouteTypesFile(manifest)
  )

  // Write the link.d.ts file if typedRoutes is enabled
  if (config.typedRoutes === true) {
    const linkTypesPath = path.join(dirname, 'link.d.ts')
    await fs.promises.writeFile(linkTypesPath, generateLinkTypesFile(manifest))
  }
}

export async function writeValidatorFile(
  manifest: RouteTypesManifest,
  filePath: string,
  strict: boolean
) {
  const dirname = path.dirname(filePath)

  if (!fs.existsSync(dirname)) {
    await fs.promises.mkdir(dirname, { recursive: true })
  }

  await fs.promises.writeFile(
    filePath,
    strict
      ? generateValidatorFileStrict(manifest)
      : generateValidatorFile(manifest)
  )
}

/**
 * Writes the entry file at {distDirRoot}/types/routes.d.ts that re-exports
 * from the actual type files. This ensures next-env.d.ts has a consistent
 * import path in development and production.
 *
 * @param entryFilePath - Path to the entry file (e.g., .next/types/routes.d.ts)
 * @param actualTypesDir - Path to the actual types directory (e.g., .next/types or .next/dev/types)
 * @param options - Configuration options for what to include
 */
export async function writeRouteTypesEntryFile(
  entryFilePath: string,
  actualTypesDir: string,
  options: {
    strictRouteTypes: boolean
    typedRoutes: boolean
    rootParams?: boolean
  }
) {
  const entryDir = path.dirname(entryFilePath)

  if (!fs.existsSync(entryDir)) {
    await fs.promises.mkdir(entryDir, { recursive: true })
  }

  // Calculate relative path from entry file to actual types directory
  const relativePath = normalizePathSep(path.relative(entryDir, actualTypesDir))
  const prefix = relativePath === '' ? './' : `./${relativePath}/`

  const lines: string[] = [
    '// This is an auto-generated entry file that re-exports route types.',
    '// Do not edit this file directly.',
    '',
    `export type * from "${prefix}route-types.d.ts";`,
  ]

  if (options.rootParams) {
    lines.push(`import "${prefix}root-params.d.ts";`)
  }

  if (options.strictRouteTypes) {
    lines.push(`import "${prefix}cache-life.d.ts";`)
    lines.push(`import "${prefix}validator.ts";`)

    if (options.typedRoutes) {
      lines.push(`import "${prefix}link.d.ts";`)
    }
  }

  lines.push('') // trailing newline

  await fs.promises.writeFile(entryFilePath, lines.join('\n'))
}

export function writeRootParamsTypesFile(
  manifest: RouteTypesManifest,
  filePath: string
) {
  writeRootParamsTypes(manifest.rootParams, filePath)
}
