import type { Rewrite } from '../lib/load-custom-routes'
import type { RouteMatchFn } from '../shared/lib/router/utils/route-matcher'
import type { NextConfig } from './config'
import type { BaseNextRequest } from './base-http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'

import { format as formatUrl, parse as parseUrl } from 'url'
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
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
} from '../lib/constants'
import { normalizeNextQueryParam } from './web/utils'

export function normalizeVercelUrl(
  req: BaseNextRequest,
  paramKeys: string[],
  defaultRouteRegex: ReturnType<typeof getNamedRouteRegex> | undefined
) {
  if (!defaultRouteRegex) return

  // make sure to normalize req.url on Vercel to strip dynamic params
  // from the query which are added during routing
  const _parsedUrl = parseUrl(req.url!, true)
  delete (_parsedUrl as any).search

  for (const key of Object.keys(_parsedUrl.query)) {
    const isNextQueryPrefix =
      key !== NEXT_QUERY_PARAM_PREFIX && key.startsWith(NEXT_QUERY_PARAM_PREFIX)

    const isNextInterceptionMarkerPrefix =
      key !== NEXT_INTERCEPTION_MARKER_PREFIX &&
      key.startsWith(NEXT_INTERCEPTION_MARKER_PREFIX)

    if (
      isNextQueryPrefix ||
      isNextInterceptionMarkerPrefix ||
      (paramKeys || Object.keys(defaultRouteRegex.groups)).includes(key)
    ) {
      delete _parsedUrl.query[key]
    }
  }

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

    pathname = pathname.replaceAll(builtParam, paramValue)
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

export function getUtils({
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
  rewrites: {
    fallback?: ReadonlyArray<Rewrite>
    afterFiles?: ReadonlyArray<Rewrite>
    beforeFiles?: ReadonlyArray<Rewrite>
  }
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

  function handleRewrites(req: BaseNextRequest, parsedUrl: UrlWithParsedQuery) {
    const rewriteParams = {}
    let fsPathname = parsedUrl.pathname

    const matchesPage = () => {
      const fsPathnameNoSlash = removeTrailingSlash(fsPathname || '')
      return (
        fsPathnameNoSlash === removeTrailingSlash(page) ||
        dynamicRouteMatcher?.(fsPathnameNoSlash)
      )
    }

    const checkRewrite = (rewrite: Rewrite): boolean => {
      const matcher = getPathMatch(
        rewrite.source + (trailingSlash ? '(/)?' : ''),
        {
          removeUnnamedParams: true,
          strict: true,
          sensitive: !!caseSensitive,
        }
      )

      if (!parsedUrl.pathname) return false

      let params = matcher(parsedUrl.pathname)

      if ((rewrite.has || rewrite.missing) && params) {
        const hasParams = matchHas(
          req,
          parsedUrl.query,
          rewrite.has,
          rewrite.missing
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
          query: parsedUrl.query,
        })

        // if the rewrite destination is external break rewrite chain
        if (parsedDestination.protocol) {
          return true
        }

        Object.assign(rewriteParams, destQuery, params)
        Object.assign(parsedUrl.query, parsedDestination.query)
        delete (parsedDestination as any).query

        Object.assign(parsedUrl, parsedDestination)

        fsPathname = parsedUrl.pathname
        if (!fsPathname) return false

        if (basePath) {
          fsPathname = fsPathname.replace(new RegExp(`^${basePath}`), '') || '/'
        }

        if (i18n) {
          const result = normalizeLocalePath(fsPathname, i18n.locales)
          fsPathname = result.pathname
          parsedUrl.query.nextInternalLocale =
            result.detectedLocale || params.nextInternalLocale
        }

        if (fsPathname === page) {
          return true
        }

        if (pageIsDynamic && dynamicRouteMatcher) {
          const dynamicParams = dynamicRouteMatcher(fsPathname)
          if (dynamicParams) {
            parsedUrl.query = {
              ...parsedUrl.query,
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
    return rewriteParams
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

  return {
    handleRewrites,
    defaultRouteRegex,
    dynamicRouteMatcher,
    defaultRouteMatches,
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
    normalizeVercelUrl: (req: BaseNextRequest, paramKeys: string[]) =>
      normalizeVercelUrl(req, paramKeys, defaultRouteRegex),
    interpolateDynamicPath: (
      pathname: string,
      params: Record<string, undefined | string | string[]>
    ) => interpolateDynamicPath(pathname, params, defaultRouteRegex),
  }
}
