import { ParsedUrlQuery } from 'querystring'
import pathMatch from './path-match'
import prepareDestination from './prepare-destination'
import { Rewrite } from '../../../../lib/load-custom-routes'
import { removePathTrailingSlash } from '../../../../client/normalize-trailing-slash'

const customRouteMatcher = pathMatch(true)

export default function resolveRewrites(
  asPath: string,
  pages: string[],
  basePath: string,
  rewrites: Rewrite[],
  query: ParsedUrlQuery,
  resolveHref: (path: string) => string
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

        if (pages.includes(removePathTrailingSlash(asPath))) {
          // check if we now match a page as this means we are done
          // resolving the rewrites
          break
        }

        // check if we match a dynamic-route, if so we break the rewrites chain
        const resolvedHref = resolveHref(asPath)

        if (resolvedHref !== asPath && pages.includes(resolvedHref)) {
          break
        }
      }
    }
  }
  return asPath
}
