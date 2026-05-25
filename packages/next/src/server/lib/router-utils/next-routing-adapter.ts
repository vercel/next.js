import type { NextConfigRuntime } from '../../config-shared'
import type { Header, Redirect, Rewrite } from '../../../lib/load-custom-routes'
import type { FilesystemDynamicRoute, setupFsCheck } from './filesystem'

import {
  convertHeaders,
  convertRedirects,
  convertRewrites,
} from 'next/dist/compiled/@vercel/routing-utils'
import { getRedirectStatus } from '../../../lib/redirect-status'

type FsChecker = Awaited<ReturnType<typeof setupFsCheck>>

export type NextRoutingRoute = {
  source?: string
  sourceRegex: string
  destination?: string
  headers?: Record<string, string>
  has?: Header['has']
  missing?: Header['missing']
  status?: number
  priority?: boolean
}

export type NextRoutingRouteConfig = {
  caseSensitive?: boolean
  beforeMiddleware: NextRoutingRoute[]
  middlewareMatchers: NextRoutingRoute[]
  beforeFiles: NextRoutingRoute[]
  afterFiles: NextRoutingRoute[]
  dynamicRoutes: NextRoutingRoute[]
  onMatch: NextRoutingRoute[]
  fallback: NextRoutingRoute[]
  shouldNormalizeNextData: boolean
}

export type NextRoutingServerState = {
  buildId: string
  basePath: string
  i18n?: NextConfigRuntime['i18n']
  pathnames: string[]
  routes: NextRoutingRouteConfig
}

type LiveHeaderRoute = Header & { regex?: string; internal?: boolean }
type LiveRedirectRoute = Redirect & { regex?: string; internal?: boolean }
type LiveRewriteRoute = Rewrite & { regex?: string; internal?: boolean }

export function normalizeNextRoutingSourceRegex(regex: string): string {
  // Some live manifest routes can carry a RegExp string from `.toString()`,
  // while @next/routing expects the pattern passed to `new RegExp()`.
  if (regex.startsWith('/')) {
    const lastSlash = regex.lastIndexOf('/')
    if (lastSlash > 0) {
      return regex.slice(1, lastSlash)
    }
  }

  return regex
}

function routeSourceRegex(route: { regex?: string }): string {
  if (!route.regex) {
    throw new Error('Expected live route to include a compiled regex')
  }

  return normalizeNextRoutingSourceRegex(route.regex)
}

function getDestinationQuery(routeKeys: Record<string, string> | undefined) {
  const items = Object.entries(routeKeys ?? {})
  if (items.length === 0) {
    return ''
  }

  return `?${items.map(([key, value]) => `${value}=$${key}`).join('&')}`
}

export function createNextRoutingHeaderRoute(
  route: LiveHeaderRoute
): NextRoutingRoute {
  const converted = convertHeaders([route])[0]

  return {
    source: route.source,
    sourceRegex: normalizeNextRoutingSourceRegex(
      converted.src || routeSourceRegex(route)
    ),
    headers: 'headers' in converted ? converted.headers || {} : {},
    has: route.has,
    missing: route.missing,
    priority: route.internal || undefined,
  }
}

export function createNextRoutingRedirectRoute(
  route: LiveRedirectRoute
): NextRoutingRoute {
  const converted = convertRedirects([route], 307)[0]

  return {
    source: route.source,
    sourceRegex: normalizeNextRoutingSourceRegex(
      converted.src || routeSourceRegex(route)
    ),
    headers: 'headers' in converted ? converted.headers || {} : {},
    status: converted.status || getRedirectStatus(route),
    has: route.has,
    missing: route.missing,
    priority: route.internal || undefined,
  }
}

export function createNextRoutingRewriteRoute(
  route: LiveRewriteRoute
): NextRoutingRoute {
  const converted = convertRewrites([route], ['nextInternalLocale'])[0]

  return {
    source: route.source,
    sourceRegex: normalizeNextRoutingSourceRegex(
      converted.src || routeSourceRegex(route)
    ),
    destination: converted.dest || route.destination,
    has: route.has,
    missing: route.missing,
    priority: route.internal || undefined,
  }
}

export function createNextRoutingDynamicRoute(
  route: FilesystemDynamicRoute
): NextRoutingRoute {
  return {
    source: route.page,
    sourceRegex: normalizeNextRoutingSourceRegex(
      route.namedRegex || route.regex
    ),
    destination: `${route.page}${getDestinationQuery(route.routeKeys)}`,
  }
}

export function createNextRoutingPathnames(
  fsChecker: Pick<
    FsChecker,
    'appFiles' | 'pageFiles' | 'nextDataRoutes' | 'getDynamicRoutes'
  >,
  {
    additionalPathnames = [],
    invokedOutputs,
  }: {
    additionalPathnames?: Iterable<string>
    invokedOutputs?: Set<string>
  } = {}
): string[] {
  const pathnames = new Set<string>()

  for (const pathname of [
    ...fsChecker.appFiles,
    ...fsChecker.pageFiles,
    ...fsChecker.nextDataRoutes,
    ...fsChecker.getDynamicRoutes().map((route) => route.page),
    ...additionalPathnames,
  ]) {
    if (!invokedOutputs?.has(pathname)) {
      pathnames.add(pathname)
    }
  }

  return [...pathnames]
}

export function createNextRoutingServerState(
  fsChecker: FsChecker,
  config: NextConfigRuntime,
  {
    additionalPathnames,
    invokedOutputs,
    minimalMode = false,
    middlewareMatchers = [],
    shouldNormalizeNextData = middlewareMatchers.length > 0,
  }: {
    additionalPathnames?: Iterable<string>
    invokedOutputs?: Set<string>
    minimalMode?: boolean
    middlewareMatchers?: NextRoutingRoute[]
    shouldNormalizeNextData?: boolean
  } = {}
): NextRoutingServerState {
  return {
    buildId: fsChecker.buildId,
    basePath: config.basePath || '',
    i18n: config.i18n,
    pathnames: createNextRoutingPathnames(fsChecker, {
      additionalPathnames,
      invokedOutputs,
    }),
    routes: {
      caseSensitive: config.experimental.caseSensitiveRoutes,
      beforeMiddleware: minimalMode
        ? []
        : [
            ...fsChecker.headers.map(createNextRoutingHeaderRoute),
            ...fsChecker.redirects.map(createNextRoutingRedirectRoute),
          ],
      middlewareMatchers,
      beforeFiles: minimalMode
        ? []
        : fsChecker.rewrites.beforeFiles.map(createNextRoutingRewriteRoute),
      afterFiles: minimalMode
        ? []
        : fsChecker.rewrites.afterFiles.map(createNextRoutingRewriteRoute),
      dynamicRoutes: fsChecker
        .getDynamicRoutes()
        .map(createNextRoutingDynamicRoute),
      onMatch: fsChecker.onMatchHeaders.map(createNextRoutingHeaderRoute),
      fallback: minimalMode
        ? []
        : fsChecker.rewrites.fallback.map(createNextRoutingRewriteRoute),
      shouldNormalizeNextData,
    },
  }
}
