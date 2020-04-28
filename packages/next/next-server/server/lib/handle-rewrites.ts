import pathMatch from './path-match'
import { prepareDestination } from '../router'
import { Rewrite } from '../../../lib/check-custom-routes'
import { getRouteMatcher } from '../../lib/router/utils/route-matcher'
import { UrlWithParsedQuery } from 'url'

const getCustomRouteMatcher = pathMatch(true)

export default function handleRewrites(
  rewrites: Rewrite[],
  dynamicRouteMatcher: ReturnType<typeof getRouteMatcher>,
  page: string,
  parsedUrl: UrlWithParsedQuery
) {
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
