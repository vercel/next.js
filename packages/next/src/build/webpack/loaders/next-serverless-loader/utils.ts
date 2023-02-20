import type { IncomingMessage, ServerResponse } from 'http'
import type { Rewrite } from '../../../../lib/load-custom-routes'
import type { BuildManifest } from '../../../../server/get-page-files'
import type { RouteMatchFn } from '../../../../shared/lib/router/utils/route-matcher'
import type { NextConfig } from '../../../../server/config'
import type {
  GetServerSideProps,
  GetStaticPaths,
  GetStaticProps,
} from '../../../../../types'
import type { BaseNextRequest } from '../../../../server/base-http'
import type { __ApiPreviewProps } from '../../../../server/api-utils'
import type { ParsedUrlQuery } from 'querystring'

import { format as formatUrl, UrlWithParsedQuery, parse as parseUrl } from 'url'
import { normalizeLocalePath } from '../../../../shared/lib/i18n/normalize-locale-path'
import { getPathMatch } from '../../../../shared/lib/router/utils/path-match'
import { getNamedRouteRegex } from '../../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../../shared/lib/router/utils/route-matcher'
import {
  matchHas,
  prepareDestination,
} from '../../../../shared/lib/router/utils/prepare-destination'
import { acceptLanguage } from '../../../../server/accept-header'
import { detectLocaleCookie } from '../../../../shared/lib/i18n/detect-locale-cookie'
import { detectDomainLocale } from '../../../../shared/lib/i18n/detect-domain-locale'
import { denormalizePagePath } from '../../../../shared/lib/page-path/denormalize-page-path'
import cookie from 'next/dist/compiled/cookie'
import { TEMPORARY_REDIRECT_STATUS } from '../../../../shared/lib/constants'
import { addRequestMeta } from '../../../../server/request-meta'
import { removeTrailingSlash } from '../../../../shared/lib/router/utils/remove-trailing-slash'
import { normalizeRscPath } from '../../../../shared/lib/router/utils/app-paths'

export const vercelHeader = 'x-vercel-id'

export type ServerlessHandlerCtx = {
  page: string

  pageModule: any
  pageComponent?: any
  pageConfig?: any
  pageGetStaticProps?: GetStaticProps
  pageGetStaticPaths?: GetStaticPaths
  pageGetServerSideProps?: GetServerSideProps

  appModule?: any
  errorModule?: any
  documentModule?: any
  notFoundModule?: any

  runtimeConfig: any
  buildManifest?: BuildManifest
  reactLoadableManifest?: any
  basePath: string
  rewrites: {
    fallback?: Rewrite[]
    afterFiles?: Rewrite[]
    beforeFiles?: Rewrite[]
  }
  pageIsDynamic: boolean
  generateEtags: boolean
  distDir: string
  buildId: string
  escapedBuildId: string
  assetPrefix: string
  poweredByHeader: boolean
  canonicalBase: string
  encodedPreviewProps: __ApiPreviewProps
  i18n?: NextConfig['i18n']
}

export function normalizeVercelUrl(
  req: BaseNextRequest | IncomingMessage,
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

    for (const param of paramKeys || Object.keys(defaultRouteRegex.groups)) {
      delete _parsedUrl.query[param]
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

export function getUtils({
  page,
  i18n,
  basePath,
  rewrites,
  pageIsDynamic,
  trailingSlash,
}: {
  page: ServerlessHandlerCtx['page']
  i18n?: ServerlessHandlerCtx['i18n']
  basePath: ServerlessHandlerCtx['basePath']
  rewrites: ServerlessHandlerCtx['rewrites']
  pageIsDynamic: ServerlessHandlerCtx['pageIsDynamic']
  trailingSlash?: boolean
}) {
  let defaultRouteRegex: ReturnType<typeof getNamedRouteRegex> | undefined
  let dynamicRouteMatcher: RouteMatchFn | undefined
  let defaultRouteMatches: ParsedUrlQuery | undefined

  if (pageIsDynamic) {
    defaultRouteRegex = getNamedRouteRegex(page)
    dynamicRouteMatcher = getRouteMatcher(defaultRouteRegex)
    defaultRouteMatches = dynamicRouteMatcher(page) as ParsedUrlQuery
  }

  function handleRewrites(
    req: BaseNextRequest | IncomingMessage,
    parsedUrl: UrlWithParsedQuery
  ) {
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

  function handleBasePath(
    req: BaseNextRequest | IncomingMessage,
    parsedUrl: UrlWithParsedQuery
  ) {
    // always strip the basePath if configured since it is required
    req.url = req.url!.replace(new RegExp(`^${basePath}`), '') || '/'
    parsedUrl.pathname =
      parsedUrl.pathname!.replace(new RegExp(`^${basePath}`), '') || '/'
  }

  function getParamsFromRouteMatches(
    req: BaseNextRequest | IncomingMessage,
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

  function normalizeDynamicRouteParams(
    params: ParsedUrlQuery,
    ignoreOptional?: boolean
  ) {
    let hasValidParams = true
    if (!defaultRouteRegex) return { params, hasValidParams: false }

    params = Object.keys(defaultRouteRegex.groups).reduce((prev, key) => {
      let value: string | string[] | undefined = params[key]

      if (typeof value === 'string') {
        value = normalizeRscPath(value, true)
      }
      if (Array.isArray(value)) {
        value = value.map((val) => {
          if (typeof val === 'string') {
            val = normalizeRscPath(val, true)
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

  function handleLocale(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery,
    routeNoAssetPath: string,
    shouldNotRedirect: boolean
  ) {
    if (!i18n) return
    const pathname = parsedUrl.pathname || '/'

    let defaultLocale = i18n.defaultLocale
    let detectedLocale = detectLocaleCookie(req, i18n.locales)
    let acceptPreferredLocale
    try {
      acceptPreferredLocale =
        i18n.localeDetection !== false
          ? acceptLanguage(req.headers['accept-language'], i18n.locales)
          : detectedLocale
    } catch (_) {
      acceptPreferredLocale = detectedLocale
    }

    const { host } = req.headers || {}
    // remove port from host and remove port if present
    const hostname = host && host.split(':')[0].toLowerCase()

    const detectedDomain = detectDomainLocale(i18n.domains, hostname)
    if (detectedDomain) {
      defaultLocale = detectedDomain.defaultLocale
      detectedLocale = defaultLocale
      addRequestMeta(req as any, '__nextIsLocaleDomain', true)
    }

    // if not domain specific locale use accept-language preferred
    detectedLocale = detectedLocale || acceptPreferredLocale

    let localeDomainRedirect
    const localePathResult = normalizeLocalePath(pathname, i18n.locales)

    routeNoAssetPath = normalizeLocalePath(
      routeNoAssetPath,
      i18n.locales
    ).pathname

    if (localePathResult.detectedLocale) {
      detectedLocale = localePathResult.detectedLocale
      req.url = formatUrl({
        ...parsedUrl,
        pathname: localePathResult.pathname,
      })
      addRequestMeta(req as any, '__nextStrippedLocale', true)
      parsedUrl.pathname = localePathResult.pathname
    }

    // If a detected locale is a domain specific locale and we aren't already
    // on that domain and path prefix redirect to it to prevent duplicate
    // content from multiple domains
    if (detectedDomain) {
      const localeToCheck = localePathResult.detectedLocale
        ? detectedLocale
        : acceptPreferredLocale

      const matchedDomain = detectDomainLocale(
        i18n.domains,
        undefined,
        localeToCheck
      )

      if (matchedDomain && matchedDomain.domain !== detectedDomain.domain) {
        localeDomainRedirect = `http${matchedDomain.http ? '' : 's'}://${
          matchedDomain.domain
        }/${localeToCheck === matchedDomain.defaultLocale ? '' : localeToCheck}`
      }
    }

    const denormalizedPagePath = denormalizePagePath(pathname)
    const detectedDefaultLocale =
      !detectedLocale ||
      detectedLocale.toLowerCase() === defaultLocale.toLowerCase()
    const shouldStripDefaultLocale = false
    // detectedDefaultLocale &&
    // denormalizedPagePath.toLowerCase() === \`/\${i18n.defaultLocale.toLowerCase()}\`

    const shouldAddLocalePrefix =
      !detectedDefaultLocale && denormalizedPagePath === '/'

    detectedLocale = detectedLocale || i18n.defaultLocale

    if (
      !shouldNotRedirect &&
      !req.headers[vercelHeader] &&
      i18n.localeDetection !== false &&
      (localeDomainRedirect ||
        shouldAddLocalePrefix ||
        shouldStripDefaultLocale)
    ) {
      // set the NEXT_LOCALE cookie when a user visits the default locale
      // with the locale prefix so that they aren't redirected back to
      // their accept-language preferred locale
      if (shouldStripDefaultLocale && acceptPreferredLocale !== defaultLocale) {
        const previous = res.getHeader('set-cookie')

        res.setHeader('set-cookie', [
          ...(typeof previous === 'string'
            ? [previous]
            : Array.isArray(previous)
            ? previous
            : []),
          cookie.serialize('NEXT_LOCALE', defaultLocale, {
            httpOnly: true,
            path: '/',
          }),
        ])
      }

      res.setHeader(
        'Location',
        formatUrl({
          // make sure to include any query values when redirecting
          ...parsedUrl,
          pathname: localeDomainRedirect
            ? localeDomainRedirect
            : shouldStripDefaultLocale
            ? basePath || '/'
            : `${basePath}/${detectedLocale}`,
        })
      )
      res.statusCode = TEMPORARY_REDIRECT_STATUS
      res.end()
      return
    }

    detectedLocale =
      localePathResult.detectedLocale ||
      (detectedDomain && detectedDomain.defaultLocale) ||
      defaultLocale

    return {
      defaultLocale,
      detectedLocale,
      routeNoAssetPath,
    }
  }

  return {
    handleLocale,
    handleRewrites,
    handleBasePath,
    defaultRouteRegex,
    dynamicRouteMatcher,
    defaultRouteMatches,
    getParamsFromRouteMatches,
    normalizeDynamicRouteParams,
    normalizeVercelUrl: (
      req: BaseNextRequest | IncomingMessage,
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
