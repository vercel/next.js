import { ParsedUrlQuery } from 'querystring'
import pathMatch from './path-match'
import prepareDestination from './prepare-destination'
import { Rewrite } from '../../../../lib/load-custom-routes'
import { removePathTrailingSlash } from '../../../../client/normalize-trailing-slash'
import { normalizeLocalePath } from '../../i18n/normalize-locale-path'

const customRouteMatcher = pathMatch(true)

export default function resolveRewrites(
  asPath: string,
  pages: string[],
  rewrites: Rewrite[],
  query: ParsedUrlQuery,
  resolveHref: (path: string) => string,
  locales?: string[]
) {
  if (!pages.includes(normalizeLocalePath(asPath, locales).pathname)) {
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
          true
        )
        asPath = destRes.parsedDestination.pathname!
        Object.assign(query, destRes.parsedDestination.query)

        const fsPathname = normalizeLocalePath(
          removePathTrailingSlash(asPath),
          locales
        ).pathname

        if (pages.includes(fsPathname)) {
          asPath = fsPathname
          // check if we now match a page as this means we are done
          // resolving the rewrites
          break
        }

        // check if we match a dynamic-route, if so we break the rewrites chain
        const resolvedHref = resolveHref(fsPathname)

        if (resolvedHref !== asPath && pages.includes(resolvedHref)) {
          asPath = fsPathname
          break
        }
      }
    }
  }
  return asPath
}
