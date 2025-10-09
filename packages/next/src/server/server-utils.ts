import type { Rewrite } from '../lib/load-custom-routes'
import type { RouteMatchFn } from '../shared/lib/router/utils/route-matcher'
import type { NextConfig } from './config'
import type { BaseNextRequest } from './base-http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'

import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import {
  matchHas,
  prepareDestination,
} from '../shared/lib/router/utils/prepare-destination'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { normalizeRscURL } from '../shared/lib/router/utils/app-paths'
import {
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
} from '../lib/constants'
import { normalizeNextQueryParam } from './web/utils'
import type { IncomingHttpHeaders, IncomingMessage } from 'http'
import { decodeQueryPathParameter } from './lib/decode-query-path-parameter'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { parseReqUrl } from '../lib/url'
import { formatUrl } from '../shared/lib/router/utils/format-url'

function filterInternalQuery(
  query: Record<string, undefined | string | string[]>,
  paramKeys: string[]
) {
  // this is used to pass query information in rewrites
  // but should not be exposed in final query
  delete query['nextInternalLocale']

  for (const key in query) {
    const isNextQueryPrefix =
      key !== NEXT_QUERY_PARAM_PREFIX && key.startsWith(NEXT_QUERY_PARAM_PREFIX)

    const isNextInterceptionMarkerPrefix =
      key !== NEXT_INTERCEPTION_MARKER_PREFIX &&
      key.startsWith(NEXT_INTERCEPTION_MARKER_PREFIX)

    if (
      isNextQueryPrefix ||
      isNextInterceptionMarkerPrefix ||
      paramKeys.includes(key)
    ) {
      delete query[key]
    }
  }
}

export function normalizeCdnUrl(
  req: BaseNextRequest | IncomingMessage,
  paramKeys: string[]
) {
  // make sure to normalize req.url from CDNs to strip dynamic and rewrite
  // params from the query which are added during routing
  const _parsedUrl = parseReqUrl(req.url!)

  // we can't normalize if we can't parse
  if (!_parsedUrl) {
    return req.url
  }
  delete (_parsedUrl as any).search
  filterInternalQuery(_parsedUrl.query, paramKeys)

  req.url = formatUrl(_parsedUrl)
}

export function interpolateDynamicPath(
  pathname: string,
  params: ParsedUrlQuery,
  defaultRouteRegex?: ReturnType<typeof getNamedRouteRegex> | undefined
) {
  if (!defaultRouteRegex) return pathname

  for (const param of Object.keys(defaultRouteRegex.groups)) {
    const { optional, repeat } = defaultRouteRegex.groups[param]
    let builtParam = `[${repeat ? '...' : ''}${param}]`

    if (optional) {
      builtParam = `[${builtParam}]`
    }

    let paramValue: string
    const value = params[param]

    if (Array.isArray(value)) {
      paramValue = value.map((v) => v && encodeURIComponent(v)).join('/')
    } else if (value) {
      paramValue = encodeURIComponent(value)
    } else {
      paramValue = ''
    }

    if (paramValue || optional) {
      pathname = pathname.replaceAll(builtParam, paramValue)
    }
  }

  return pathname
}

export function normalizeDynamicRouteParams(
  query: ParsedUrlQuery,
  defaultRouteRegex: ReturnType<typeof getNamedRouteRegex>,
  defaultRouteMatches: ParsedUrlQuery,
  ignoreMissingOptional: boolean
) {
  let hasValidParams = true
  let params: ParsedUrlQuery = {}

  for (const key of Object.keys(defaultRouteRegex.groups)) {
    let value: string | string[] | undefined = query[key]

    if (typeof value === 'string') {
      value = normalizeRscURL(value)
    } else if (Array.isArray(value)) {
      value = value.map(normalizeRscURL)
    }

    // if the value matches the default value we can't rely
    // on the parsed params, this is used to signal if we need
    // to parse x-now-route-matches or not
    const defaultValue = defaultRouteMatches![key]
    const isOptional = defaultRouteRegex!.groups[key].optional

    const isDefaultValue = Array.isArray(defaultValue)
      ? defaultValue.some((defaultVal) => {
          return Array.isArray(value)
            ? value.some((val) => val.includes(defaultVal))
            : value?.includes(defaultVal)
        })
      : value?.includes(defaultValue as string)

    if (
      isDefaultValue ||
      (typeof value === 'undefined' && !(isOptional && ignoreMissingOptional))
    ) {
      return { params: {}, hasValidParams: false }
    }

    // non-provided optional values should be undefined so normalize
    // them to undefined
    if (
      isOptional &&
      (!value ||
        (Array.isArray(value) &&
          value.length === 1 &&
          // fallback optional catch-all SSG pages have
          // [[...paramName]] for the root path on Vercel
          (value[0] === 'index' || value[0] === `[[...${key}]]`)))
    ) {
      value = undefined
      delete query[key]
    }

    // query values from the proxy aren't already split into arrays
    // so make sure to normalize catch-all values
    if (
      value &&
      typeof value === 'string' &&
      defaultRouteRegex!.groups[key].repeat
    ) {
      value = value.split('/')
    }

    if (value) {
      params[key] = value
    }
  }

  return {
    params,
    hasValidParams,
  }
}

export function getServerUtils({
  page,
  i18n,
  basePath,
  rewrites,
  pageIsDynamic,
  trailingSlash,
  caseSensitive,
}: {
  page: string
  i18n?: NextConfig['i18n']
  basePath: string
  rewrites: DeepReadonly<{
    fallback?: ReadonlyArray<Rewrite>
    afterFiles?: ReadonlyArray<Rewrite>
    beforeFiles?: ReadonlyArray<Rewrite>
  }>
  pageIsDynamic: boolean
  trailingSlash?: boolean
  caseSensitive: boolean
}) {
  let defaultRouteRegex: ReturnType<typeof getNamedRouteRegex> | undefined
  let dynamicRouteMatcher: RouteMatchFn | undefined
  let defaultRouteMatches: ParsedUrlQuery | undefined

  if (pageIsDynamic) {
    defaultRouteRegex = getNamedRouteRegex(page, {
      prefixRouteKeys: false,
    })
    dynamicRouteMatcher = getRouteMatcher(defaultRouteRegex)
    defaultRouteMatches = dynamicRouteMatcher(page) as ParsedUrlQuery
  }

  function handleRewrites(
    req: BaseNextRequest | IncomingMessage,
    parsedUrl: DeepReadonly<UrlWithParsedQuery>
  ) {
    // Here we deep clone the parsedUrl to avoid mutating the original. We also
    // cast this to a mutable type so we can mutate it within this scope.
    const rewrittenParsedUrl = structuredClone(parsedUrl) as UrlWithParsedQuery
    const rewriteParams: Record<string, string> = {}
    let fsPathname = rewrittenParsedUrl.pathname

    const matchesPage = () => {
      const fsPathnameNoSlash = removeTrailingSlash(fsPathname || '')
      return (
        fsPathnameNoSlash === removeTrailingSlash(page) ||
        dynamicRouteMatcher?.(fsPathnameNoSlash)
      )
    }

    const checkRewrite = (rewrite: DeepReadonly<Rewrite>): boolean => {
      const matcher = getPathMatch(
        rewrite.source + (trailingSlash ? '(/)?' : ''),
        {
          removeUnnamedParams: true,
          strict: true,
          sensitive: !!caseSensitive,
        }
      )

      if (!rewrittenParsedUrl.pathname) return false

      let params = matcher(rewrittenParsedUrl.pathname)

      if ((rewrite.has || rewrite.missing) && params) {
        const hasParams = matchHas(
          req,
          rewrittenParsedUrl.query,
          rewrite.has as Rewrite['has'],
          rewrite.missing as Rewrite['missing']
        )

        if (hasParams) {
          Object.assign(params, hasParams)
        } else {
          params = false
        }
      }

      if (params) {
        const { parsedDestination, destQuery } = prepareDestination({
          appendParamsToQuery: true,
          destination: rewrite.destination,
          params: params,
          query: rewrittenParsedUrl.query,
        })

        // if the rewrite destination is external break rewrite chain
        if (parsedDestination.protocol) {
          return true
        }

        Object.assign(rewriteParams, destQuery, params)
        Object.assign(rewrittenParsedUrl.query, parsedDestination.query)
        delete (parsedDestination as any).query

        Object.assign(rewrittenParsedUrl, parsedDestination)

        fsPathname = rewrittenParsedUrl.pathname
        if (!fsPathname) return false

        if (basePath) {
          fsPathname = fsPathname.replace(new RegExp(`^${basePath}`), '') || '/'
        }

        if (i18n) {
          const result = normalizeLocalePath(fsPathname, i18n.locales)
          fsPathname = result.pathname
          rewrittenParsedUrl.query.nextInternalLocale =
            result.detectedLocale || params.nextInternalLocale
        }

        if (fsPathname === page) {
          return true
        }

        if (pageIsDynamic && dynamicRouteMatcher) {
          const dynamicParams = dynamicRouteMatcher(fsPathname)
          if (dynamicParams) {
            rewrittenParsedUrl.query = {
              ...rewrittenParsedUrl.query,
              ...dynamicParams,
            }
            return true
          }
        }
      }

      return false
    }

    for (const rewrite of rewrites.beforeFiles || []) {
      checkRewrite(rewrite)
    }

    if (fsPathname !== page) {
      let finished = false

      for (const rewrite of rewrites.afterFiles || []) {
        finished = checkRewrite(rewrite)
        if (finished) break
      }

      if (!finished && !matchesPage()) {
        for (const rewrite of rewrites.fallback || []) {
          finished = checkRewrite(rewrite)
          if (finished) break
        }
      }
    }

    return { rewriteParams, rewrittenParsedUrl }
  }

  function getParamsFromRouteMatches(routeMatchesHeader: string) {
    // If we don't have a default route regex, we can't get params from route
    // matches
    if (!defaultRouteRegex) return null

    const { groups, routeKeys } = defaultRouteRegex

    const matcher = getRouteMatcher({
      re: {
        // Simulate a RegExp match from the \`req.url\` input
        exec: (str: string) => {
          // Normalize all the prefixed query params.
          const obj: Record<string, string> = Object.fromEntries(
            new URLSearchParams(str)
          )
          for (const [key, value] of Object.entries(obj)) {
            const normalizedKey = normalizeNextQueryParam(key)
            if (!normalizedKey) continue

            obj[normalizedKey] = value
            delete obj[key]
          }

          // Use all the named route keys.
          const result = {} as RegExpExecArray
          for (const keyName of Object.keys(routeKeys)) {
            const paramName = routeKeys[keyName]

            // If this param name is not a valid parameter name, then skip it.
            if (!paramName) continue

            const group = groups[paramName]
            const value = obj[keyName]

            // When we're missing a required param, we can't match the route.
            if (!group.optional && !value) return null

            result[group.pos] = value
          }

          return result
        },
      },
      groups,
    })

    const routeMatches = matcher(routeMatchesHeader)
    if (!routeMatches) return null

    return routeMatches
  }

  function normalizeQueryParams(
    query: Record<string, string | string[] | undefined>,
    routeParamKeys: Set<string>
  ) {
    // this is used to pass query information in rewrites
    // but should not be exposed in final query
    delete query['nextInternalLocale']

    for (const [key, value] of Object.entries(query)) {
      const normalizedKey = normalizeNextQueryParam(key)
      if (!normalizedKey) continue

      // Remove the prefixed key from the query params because we want
      // to consume it for the dynamic route matcher.
      delete query[key]
      routeParamKeys.add(normalizedKey)

      if (typeof value === 'undefined') continue

      query[normalizedKey] = Array.isArray(value)
        ? value.map((v) => decodeQueryPathParameter(v))
        : decodeQueryPathParameter(value)
    }
  }

  return {
    handleRewrites,
    defaultRouteRegex,
    dynamicRouteMatcher,
    defaultRouteMatches,
    normalizeQueryParams,
    getParamsFromRouteMatches,
    /**
     * Normalize dynamic route params.
     *
     * @param query - The query params to normalize.
     * @param ignoreMissingOptional - Whether to ignore missing optional params.
     * @returns The normalized params and whether they are valid.
     */
    normalizeDynamicRouteParams: (
      query: ParsedUrlQuery,
      ignoreMissingOptional: boolean
    ) => {
      if (!defaultRouteRegex || !defaultRouteMatches) {
        return { params: {}, hasValidParams: false }
      }

      return normalizeDynamicRouteParams(
        query,
        defaultRouteRegex,
        defaultRouteMatches,
        ignoreMissingOptional
      )
    },

    normalizeCdnUrl: (
      req: BaseNextRequest | IncomingMessage,
      paramKeys: string[]
    ) => normalizeCdnUrl(req, paramKeys),

    interpolateDynamicPath: (
      pathname: string,
      params: Record<string, undefined | string | string[]>
    ) => interpolateDynamicPath(pathname, params, defaultRouteRegex),

    filterInternalQuery: (query: ParsedUrlQuery, paramKeys: string[]) =>
      filterInternalQuery(query, paramKeys),
  }
}

export function getPreviouslyRevalidatedTags(
  headers: IncomingHttpHeaders,
  previewModeId: string | undefined
): string[] {
  return typeof headers[NEXT_CACHE_REVALIDATED_TAGS_HEADER] === 'string' &&
    headers[NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER] === previewModeId
    ? headers[NEXT_CACHE_REVALIDATED_TAGS_HEADER].split(',')
    : []
}
