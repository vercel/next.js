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
import { NEXT_QUERY_PARAM_PREFIX } from '../lib/constants'

export function normalizeVercelUrl(
  req: BaseNextRequest,
  trustQuery: boolean,
  paramKeys?: string[],
  pageIsDynamic?: boolean,
  defaultRouteRegex?: ReturnType<typeof getNamedRouteRegex> | undefined
) {
  // make sure to normalize req.url on Vercel to strip dynamic params
  // from the query which are added during routing
  if (pageIsDynamic && trustQuery && defaultRouteRegex) {
    const _parsedUrl = parseUrl(req.url!, true)
    delete (_parsedUrl as any).search

    for (const key of Object.keys(_parsedUrl.query)) {
      if (
        (key !== NEXT_QUERY_PARAM_PREFIX &&
          key.startsWith(NEXT_QUERY_PARAM_PREFIX)) ||
        (paramKeys || Object.keys(defaultRouteRegex.groups)).includes(key)
      ) {
        delete _parsedUrl.query[key]
      }
    }
    req.url = formatUrl(_parsedUrl)
  }
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

    const paramIdx = pathname!.indexOf(builtParam)

    if (paramIdx > -1) {
      let paramValue: string
      const value = params[param]

      if (Array.isArray(value)) {
        paramValue = value.map((v) => v && encodeURIComponent(v)).join('/')
      } else if (value) {
        paramValue = encodeURIComponent(value)
      } else {
        paramValue = ''
      }

      pathname =
        pathname.slice(0, paramIdx) +
        paramValue +
        pathname.slice(paramIdx + builtParam.length)
    }
  }

  return pathname
}

export function normalizeDynamicRouteParams(
  params: ParsedUrlQuery,
  ignoreOptional?: boolean,
  defaultRouteRegex?: ReturnType<typeof getNamedRouteRegex> | undefined,
  defaultRouteMatches?: ParsedUrlQuery | undefined
) {
  let hasValidParams = true
  if (!defaultRouteRegex) return { params, hasValidParams: false }

  params = Object.keys(defaultRouteRegex.groups).reduce((prev, key) => {
    let value: string | string[] | undefined = params[key]

    if (typeof value === 'string') {
      value = normalizeRscURL(value)
    }
    if (Array.isArray(value)) {
      value = value.map((val) => {
        if (typeof val === 'string') {
          val = normalizeRscURL(val)
        }
        return val
      })
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
      (typeof value === 'undefined' && !(isOptional && ignoreOptional))
    ) {
      hasValidParams = false
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
      delete params[key]
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
      prev[key] = value
    }
    return prev
  }, {} as ParsedUrlQuery)

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
    defaultRouteRegex = getNamedRouteRegex(page, false)
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

        if (basePath) {
          fsPathname =
            fsPathname!.replace(new RegExp(`^${basePath}`), '') || '/'
        }

        if (i18n) {
          const destLocalePathResult = normalizeLocalePath(
            fsPathname!,
            i18n.locales
          )
          fsPathname = destLocalePathResult.pathname
          parsedUrl.query.nextInternalLocale =
            destLocalePathResult.detectedLocale || params.nextInternalLocale
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

  function getParamsFromRouteMatches(
    req: BaseNextRequest,
    renderOpts?: any,
    detectedLocale?: string
  ) {
    return getRouteMatcher(
      (function () {
        const { groups, routeKeys } = defaultRouteRegex!

        return {
          re: {
            // Simulate a RegExp match from the \`req.url\` input
            exec: (str: string) => {
              const obj = Object.fromEntries(new URLSearchParams(str))
              const matchesHasLocale =
                i18n && detectedLocale && obj['1'] === detectedLocale

              for (const key of Object.keys(obj)) {
                const value = obj[key]

                if (
                  key !== NEXT_QUERY_PARAM_PREFIX &&
                  key.startsWith(NEXT_QUERY_PARAM_PREFIX)
                ) {
                  const normalizedKey = key.substring(
                    NEXT_QUERY_PARAM_PREFIX.length
                  )
                  obj[normalizedKey] = value
                  delete obj[key]
                }
              }

              // favor named matches if available
              const routeKeyNames = Object.keys(routeKeys || {})
              const filterLocaleItem = (val: string | string[] | undefined) => {
                if (i18n) {
                  // locale items can be included in route-matches
                  // for fallback SSG pages so ensure they are
                  // filtered
                  const isCatchAll = Array.isArray(val)
                  const _val = isCatchAll ? val[0] : val

                  if (
                    typeof _val === 'string' &&
                    i18n.locales.some((item) => {
                      if (item.toLowerCase() === _val.toLowerCase()) {
                        detectedLocale = item
                        renderOpts.locale = detectedLocale
                        return true
                      }
                      return false
                    })
                  ) {
                    // remove the locale item from the match
                    if (isCatchAll) {
                      ;(val as string[]).splice(0, 1)
                    }

                    // the value is only a locale item and
                    // shouldn't be added
                    return isCatchAll ? val.length === 0 : true
                  }
                }
                return false
              }

              if (routeKeyNames.every((name) => obj[name])) {
                return routeKeyNames.reduce((prev, keyName) => {
                  const paramName = routeKeys?.[keyName]

                  if (paramName && !filterLocaleItem(obj[keyName])) {
                    prev[groups[paramName].pos] = obj[keyName]
                  }
                  return prev
                }, {} as any)
              }

              return Object.keys(obj).reduce((prev, key) => {
                if (!filterLocaleItem(obj[key])) {
                  let normalizedKey = key

                  if (matchesHasLocale) {
                    normalizedKey = parseInt(key, 10) - 1 + ''
                  }
                  return Object.assign(prev, {
                    [normalizedKey]: obj[key],
                  })
                }
                return prev
              }, {})
            },
          },
          groups,
        }
      })() as any
    )(req.headers['x-now-route-matches'] as string) as ParsedUrlQuery
  }

  return {
    handleRewrites,
    defaultRouteRegex,
    dynamicRouteMatcher,
    defaultRouteMatches,
    getParamsFromRouteMatches,
    normalizeDynamicRouteParams: (
      params: ParsedUrlQuery,
      ignoreOptional?: boolean
    ) =>
      normalizeDynamicRouteParams(
        params,
        ignoreOptional,
        defaultRouteRegex,
        defaultRouteMatches
      ),
    normalizeVercelUrl: (
      req: BaseNextRequest,
      trustQuery: boolean,
      paramKeys?: string[]
    ) =>
      normalizeVercelUrl(
        req,
        trustQuery,
        paramKeys,
        pageIsDynamic,
        defaultRouteRegex
      ),
    interpolateDynamicPath: (
      pathname: string,
      params: Record<string, undefined | string | string[]>
    ) => interpolateDynamicPath(pathname, params, defaultRouteRegex),
  }
}
