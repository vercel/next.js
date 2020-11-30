import { IncomingMessage, ServerResponse } from 'http'
import { format as formatUrl, UrlWithParsedQuery } from 'url'
import { ParsedUrlQuery } from 'querystring'
import { Rewrite } from '../../../../lib/load-custom-routes'
import { normalizeLocalePath } from '../../../../next-server/lib/i18n/normalize-locale-path'
import pathMatch from '../../../../next-server/lib/router/utils/path-match'
import { getRouteRegex } from '../../../../next-server/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../../next-server/lib/router/utils/route-matcher'
import prepareDestination from '../../../../next-server/lib/router/utils/prepare-destination'
import { __ApiPreviewProps } from '../../../../next-server/server/api-utils'
import { BuildManifest } from '../../../../next-server/server/get-page-files'
import {
  GetServerSideProps,
  GetStaticPaths,
  GetStaticProps,
} from '../../../../types'
import accept from '@hapi/accept'
import { detectLocaleCookie } from '../../../../next-server/lib/i18n/detect-locale-cookie'
import { detectDomainLocale } from '../../../../next-server/lib/i18n/detect-domain-locale'
import { denormalizePagePath } from '../../../../next-server/server/denormalize-page-path'
import cookie from 'next/dist/compiled/cookie'
import { TEMPORARY_REDIRECT_STATUS } from '../../../../next-server/lib/constants'

const getCustomRouteMatcher = pathMatch(true)

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
  rewrites: Rewrite[]
  pageIsDynamic: boolean
  generateEtags: boolean
  distDir: string
  buildId: string
  escapedBuildId: string
  assetPrefix: string
  poweredByHeader: boolean
  canonicalBase: string
  encodedPreviewProps: __ApiPreviewProps
  i18n?: {
    localeDetection?: false
    locales: string[]
    defaultLocale: string
    domains: Array<{
      domain: string
      locales: string[]
      defaultLocale: string
    }>
  }
  experimental: {
    initServer: () => Promise<any>
    onError: ({ err }: { err: Error }) => Promise<any>
  }
}

export function getUtils({
  page,
  i18n,
  basePath,
  rewrites,
  pageIsDynamic,
}: ServerlessHandlerCtx) {
  let defaultRouteRegex: ReturnType<typeof getRouteRegex> | undefined
  let dynamicRouteMatcher: ReturnType<typeof getRouteMatcher> | undefined
  let defaultRouteMatches: ParsedUrlQuery | undefined

  if (pageIsDynamic) {
    defaultRouteRegex = getRouteRegex(page)
    dynamicRouteMatcher = getRouteMatcher(defaultRouteRegex)
    defaultRouteMatches = dynamicRouteMatcher(page) as ParsedUrlQuery
  }

  function handleRewrites(parsedUrl: UrlWithParsedQuery) {
    for (const rewrite of rewrites) {
      const matcher = getCustomRouteMatcher(rewrite.source)
      const params = matcher(parsedUrl.pathname)

      if (params) {
        const { parsedDestination } = prepareDestination(
          rewrite.destination,
          params,
          parsedUrl.query,
          true,
          ''
        )

        Object.assign(parsedUrl.query, parsedDestination.query)
        delete (parsedDestination as any).query

        Object.assign(parsedUrl, parsedDestination)

        let fsPathname = parsedUrl.pathname

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
          break
        }

        if (pageIsDynamic && dynamicRouteMatcher) {
          const dynamicParams = dynamicRouteMatcher(fsPathname)
          if (dynamicParams) {
            parsedUrl.query = {
              ...parsedUrl.query,
              ...dynamicParams,
            }
            break
          }
        }
      }
    }

    return parsedUrl
  }

  function handleBasePath(req: IncomingMessage, parsedUrl: UrlWithParsedQuery) {
    // always strip the basePath if configured since it is required
    req.url = req.url!.replace(new RegExp(`^${basePath}`), '') || '/'
    parsedUrl.pathname =
      parsedUrl.pathname!.replace(new RegExp(`^${basePath}`), '') || '/'
  }

  function normalizeDynamicRouteParams(params: ParsedUrlQuery) {
    let hasValidParams = true
    if (!defaultRouteRegex) return { params, hasValidParams }

    params = Object.keys(defaultRouteRegex.groups).reduce((prev, key) => {
      let value: string | string[] | undefined = params[key]

      // if the value matches the default value we can't rely
      // on the parsed params, this is used to signal if we need
      // to parse x-now-route-matches or not
      const isDefaultValue = Array.isArray(value)
        ? value.every((val, idx) => val === defaultRouteMatches![key][idx])
        : value === defaultRouteMatches![key]

      if (isDefaultValue || typeof value === 'undefined') {
        hasValidParams = false
      }

      // non-provided optional values should be undefined so normalize
      // them to undefined
      if (
        defaultRouteRegex!.groups[key].optional &&
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

    let defaultLocale = i18n.defaultLocale
    let detectedLocale = detectLocaleCookie(req, i18n.locales)
    let acceptPreferredLocale =
      i18n.localeDetection !== false
        ? accept.language(req.headers['accept-language'], i18n.locales)
        : detectedLocale

    const { host } = req.headers || {}
    // remove port from host and remove port if present
    const hostname = host && host.split(':')[0].toLowerCase()

    const detectedDomain = detectDomainLocale(i18n.domains, hostname)
    if (detectedDomain) {
      defaultLocale = detectedDomain.defaultLocale
      detectedLocale = defaultLocale
    }

    // if not domain specific locale use accept-language preferred
    detectedLocale = detectedLocale || acceptPreferredLocale

    let localeDomainRedirect
    const localePathResult = normalizeLocalePath(
      parsedUrl.pathname!,
      i18n.locales
    )

    routeNoAssetPath = normalizeLocalePath(routeNoAssetPath, i18n.locales)
      .pathname

    if (localePathResult.detectedLocale) {
      detectedLocale = localePathResult.detectedLocale
      req.url = formatUrl({
        ...parsedUrl,
        pathname: localePathResult.pathname,
      })
      ;(req as any).__nextStrippedLocale = true
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

    const denormalizedPagePath = denormalizePagePath(parsedUrl.pathname || '/')
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
    normalizeDynamicRouteParams,
  }
}
