import { Rewrite } from '../../../lib/check-custom-routes'
import { parse, UrlWithParsedQuery } from 'url'
import pathMatch from './path-match'
import { prepareDestination } from '../router'
import { apiResolver } from './../api-utils'

const getCustomRouteMatcher = pathMatch(true)

export function createServerlessHandler({
  basePath,
  initServer,
  onError,
  page,
  pageIsDynamicRoute,
  previewProps,
  resolver,
  rewrites,
  runtimeConfig,
}: {
  basePath: string
  initServer: () => Promise<void>
  onError: (params: { err: Error }) => Promise<void>
  page: string
  pageIsDynamicRoute: boolean
  previewProps: any
  resolver: any
  rewrites: Rewrite[]
  runtimeConfig: any
}) {
  if (runtimeConfig) {
    const { setConfig } = require('next/config')
    setConfig(runtimeConfig)
  }

  const dynamicRouteMatcher = pageIsDynamicRoute
    ? createDynamicRouteMatcher(page)
    : null

  const handleRewrites = (parsedUrl: UrlWithParsedQuery) => {
    for (const rewrite of rewrites) {
      const matcher = getCustomRouteMatcher(rewrite.source)
      const params = matcher(parsedUrl.pathname)

      if (params) {
        const { parsedDestination } = prepareDestination(
          rewrite.destination,
          params,
          parsedUrl.query
        )
        Object.assign(parsedUrl.query, parsedDestination.query, params)
        delete parsedDestination.query

        Object.assign(parsedUrl, parsedDestination)

        if (parsedUrl.pathname === page) {
          break
        }
        if (dynamicRouteMatcher) {
          const dynamicParams = dynamicRouteMatcher(parsedUrl.pathname)
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

  return async (req: any, res: any) => {
    try {
      await initServer()

      if (basePath && req.url.startsWith(basePath)) {
        req.url = req.url.replace(basePath, '')
      }

      const parsedUrl = handleRewrites(parse(req.url, true))
      const params = dynamicRouteMatcher
        ? dynamicRouteMatcher(parsedUrl.pathname)
        : {}

      await apiResolver(
        req,
        res,
        Object.assign({}, parsedUrl.query, params),
        resolver,
        previewProps,
        onError
      )
    } catch (err) {
      console.error(err)
      await onError(err)

      if (err.code === 'DECODE_FAILED') {
        res.statusCode = 400
        res.end('Bad Request')
      } else {
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  }
}

function createDynamicRouteMatcher(page: string) {
  const { getRouteMatcher } = require('../../lib/router/utils/route-matcher')
  const { getRouteRegex } = require('../../lib/router/utils/route-regex')

  return getRouteMatcher(getRouteRegex(page))
}
