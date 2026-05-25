import type { NextConfigRuntime } from '../../config-shared'
import type { Header, Redirect, Rewrite } from '../../../lib/load-custom-routes'
import type {
  FilesystemDynamicRoute,
  FsOutput,
  setupFsCheck,
} from './filesystem'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import {
  convertHeaders,
  convertRedirects,
  convertRewrites,
} from 'next/dist/compiled/@vercel/routing-utils'
import {
  allowedStatusCodes,
  getRedirectStatus,
} from '../../../lib/redirect-status'
import { parseUrl } from '../../../shared/lib/router/utils/parse-url'

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

type NextRoutingI18nConfig = {
  defaultLocale: string
  domains?: Array<{
    defaultLocale: string
    domain: string
    http?: true
    locales?: string[]
  }>
  localeDetection?: false
  locales: string[]
}

export type NextRoutingServerState = {
  buildId: string
  basePath: string
  i18n?: NextRoutingI18nConfig
  pathnames: string[]
  routes: NextRoutingRouteConfig
}

export type NextRoutingResolveResult = {
  middlewareResponded?: boolean
  externalRewrite?: URL
  redirect?: {
    url: URL
    status: number
  }
  resolvedPathname?: string
  resolvedQuery?: Record<string, string | string[]>
  invocationTarget?: {
    pathname: string
    query: Record<string, string | string[]>
  }
  resolvedHeaders?: Headers
  status?: number
  routeMatches?: Record<string, string>
}

export type NextRoutingMappedResult = {
  finished: boolean
  statusCode?: number
  bodyStream?: ReadableStream | null
  resHeaders: Record<string, string | string[]> | null
  parsedUrl: NextUrlWithParsedQuery
  matchedOutput?: FsOutput | null
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

function createNextRoutingI18nConfig(
  i18n: NextConfigRuntime['i18n']
): NextRoutingI18nConfig | undefined {
  if (!i18n) {
    return undefined
  }

  return {
    defaultLocale: i18n.defaultLocale,
    domains: i18n.domains?.map((domain) => ({
      defaultLocale: domain.defaultLocale,
      domain: domain.domain,
      http: domain.http,
      locales: domain.locales ? [...domain.locales] : undefined,
    })),
    localeDetection: i18n.localeDetection,
    locales: [...i18n.locales],
  }
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
    i18n: createNextRoutingI18nConfig(config.i18n),
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

function headersToRecord(
  headers: Headers | undefined
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {}

  if (!headers) {
    return record
  }

  headers.forEach((value, key) => {
    record[key] = value
  })

  const setCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.()
  if (setCookie?.length) {
    record['set-cookie'] = setCookie
  }

  return record
}

function getRelativeUrl(url: URL, initUrl: URL) {
  if (url.origin === initUrl.origin) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  return url.toString()
}

function parseRedirectDestination(destination: string) {
  const parsedUrl = parseUrl(destination) as NextUrlWithParsedQuery

  // Live custom-route redirects assign `search` from `stringifyQuery()`,
  // which intentionally omits the leading `?`.
  if (parsedUrl.search?.startsWith('?')) {
    parsedUrl.search = parsedUrl.search.slice(1)
  }

  return parsedUrl
}

function setParsedUrlInvocationTarget(
  parsedUrl: NextUrlWithParsedQuery,
  invocationTarget: NonNullable<NextRoutingResolveResult['invocationTarget']>
) {
  parsedUrl.pathname = invocationTarget.pathname
  parsedUrl.query = { ...invocationTarget.query }
}

export async function mapNextRoutingResultToResolveRoutesResult({
  result,
  fsChecker,
  initUrl,
  requestUrl,
  invokedOutputs,
}: {
  result: NextRoutingResolveResult
  fsChecker: Pick<FsChecker, 'getItem'>
  initUrl: URL
  requestUrl: string
  invokedOutputs?: Set<string>
}): Promise<NextRoutingMappedResult> {
  const resHeaders = headersToRecord(result.resolvedHeaders)
  const parsedUrl = parseUrl(requestUrl) as NextUrlWithParsedQuery

  if (result.middlewareResponded) {
    return {
      finished: true,
      parsedUrl,
      resHeaders,
      statusCode: result.status,
    }
  }

  if (result.externalRewrite) {
    return {
      finished: true,
      parsedUrl: parseUrl(
        result.externalRewrite.toString()
      ) as NextUrlWithParsedQuery,
      resHeaders,
      statusCode: result.status,
    }
  }

  if (result.redirect) {
    return {
      finished: true,
      parsedUrl: parseRedirectDestination(
        getRelativeUrl(result.redirect.url, initUrl)
      ),
      resHeaders: null,
      statusCode: result.redirect.status,
    }
  }

  const location = result.resolvedHeaders?.get('location')
  if (result.status && location && allowedStatusCodes.has(result.status)) {
    return {
      finished: true,
      parsedUrl: parseRedirectDestination(location),
      resHeaders: null,
      statusCode: result.status,
    }
  }

  if (result.invocationTarget) {
    setParsedUrlInvocationTarget(parsedUrl, result.invocationTarget)
  } else if (result.resolvedPathname) {
    parsedUrl.pathname = result.resolvedPathname
    if (result.resolvedQuery) {
      parsedUrl.query = { ...result.resolvedQuery }
    }
  }

  let matchedOutput: FsOutput | null = null
  if (
    result.resolvedPathname &&
    !invokedOutputs?.has(result.resolvedPathname)
  ) {
    matchedOutput = await fsChecker.getItem(result.resolvedPathname)
  }

  return {
    finished: !!matchedOutput,
    parsedUrl,
    resHeaders,
    matchedOutput,
    statusCode: result.status,
  }
}
