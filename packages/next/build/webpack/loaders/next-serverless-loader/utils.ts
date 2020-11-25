import { IncomingMessage } from 'http'
import { UrlWithParsedQuery } from 'url'
import { ParsedUrlQuery } from 'querystring'
import { Rewrite } from 'next/dist/lib/load-custom-routes'
import { normalizeLocalePath } from 'next/dist/next-server/lib/i18n/normalize-locale-path'
import pathMatch from 'next/dist/next-server/lib/router/utils/path-match'
import { getRouteRegex } from 'next/dist/next-server/lib/router/utils/route-regex'
import { getRouteMatcher } from 'next/dist/next-server/lib/router/utils/route-matcher'
import prepareDestination from 'next/dist/next-server/lib/router/utils/prepare-destination'
import { __ApiPreviewProps } from 'next/dist/next-server/server/api-utils'

const getCustomRouteMatcher = pathMatch(true)

export const vercelHeader = 'x-vercel-id'

export type ServerlessHandlerCtx = {
  page: string
  pageModule: any
  absolutePagePath: string
  basePath: string
  rewrites: Rewrite[]
  pageIsDynamic: boolean
  encodedPreviewProps: __ApiPreviewProps
  i18n?: {
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
          basePath
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

  function normalizeDynamicRouteParams(query: ParsedUrlQuery) {
    let hasValidParams = true
    if (!defaultRouteRegex) return { query, hasValidParams }

    query = Object.keys(defaultRouteRegex.groups).reduce((prev, key) => {
      let value: string | string[] | undefined = query[key]

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
        prev[key] = value
      }
      return prev
    }, {} as ParsedUrlQuery)

    return {
      query,
      hasValidParams,
    }
  }

  return {
    handleRewrites,
    handleBasePath,
    dynamicRouteMatcher,
    defaultRouteMatches,
    normalizeDynamicRouteParams,
  }
}
