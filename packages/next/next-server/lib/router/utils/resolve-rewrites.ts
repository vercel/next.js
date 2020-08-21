import { ParsedUrlQuery } from 'querystring'
import pathMatch from './path-match'
import prepareDestination from './prepare-destination'
import { Rewrite } from '../../../../lib/load-custom-routes'

const customRouteMatcher = pathMatch(true)

export default function resolveRewrites(
  asPath: string,
  pages: string[],
  basePath: string,
  rewrites: Rewrite[],
  query: ParsedUrlQuery
) {
  if (!pages.includes(asPath)) {
    for (const rewrite of rewrites) {
      const matcher = customRouteMatcher(rewrite.source)
      const params = matcher(asPath)

      if (params) {
        if (!rewrite.destination) {
          // this is a proxied rewrite which isn't handled on the client
          break
        }
        const destRes = prepareDestination(
          rewrite.destination,
          params,
          query,
          true,
          rewrite.basePath === false ? '' : basePath
        )
        asPath = destRes.parsedDestination.pathname!
        Object.assign(query, destRes.parsedDestination.query)

        if (pages.includes(asPath)) {
          // check if we now match a page as this means we are done
          // resolving the rewrites
          break
        }
      }
    }
  }
  return asPath
}
