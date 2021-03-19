import { ParsedUrlQuery } from 'querystring'
import pathMatch from './path-match'
import prepareDestination from './prepare-destination'
import { Rewrite } from '../../../../lib/load-custom-routes'
import { removePathTrailingSlash } from '../../../../client/normalize-trailing-slash'
import { normalizeLocalePath } from '../../i18n/normalize-locale-path'
import { parseRelativeUrl } from './parse-relative-url'
import { delBasePath } from '../router'

const customRouteMatcher = pathMatch(true)

export default function resolveRewrites(
  asPath: string,
  pages: string[],
  rewrites: Rewrite[],
  query: ParsedUrlQuery,
  resolveHref: (path: string) => string,
  locales?: string[]
): {
  matchedPage: boolean
  parsedAs: ReturnType<typeof parseRelativeUrl>
  asPath: string
  resolvedHref?: string
} {
  let matchedPage = false
  let parsedAs = parseRelativeUrl(asPath)
  let fsPathname = removePathTrailingSlash(
    normalizeLocalePath(delBasePath(parsedAs.pathname), locales).pathname
  )
  let resolvedHref

  if (!pages.includes(fsPathname)) {
    for (const rewrite of rewrites) {
      const matcher = customRouteMatcher(rewrite.source)
      const params = matcher(parsedAs.pathname)

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
        parsedAs = destRes.parsedDestination
        asPath = destRes.newUrl
        Object.assign(query, destRes.parsedDestination.query)

        fsPathname = removePathTrailingSlash(
          normalizeLocalePath(delBasePath(asPath), locales).pathname
        )

        if (pages.includes(fsPathname)) {
          // check if we now match a page as this means we are done
          // resolving the rewrites
          matchedPage = true
          resolvedHref = fsPathname
          break
        }

        // check if we match a dynamic-route, if so we break the rewrites chain
        resolvedHref = resolveHref(fsPathname)

        if (resolvedHref !== asPath && pages.includes(resolvedHref)) {
          matchedPage = true
          break
        }
      }
    }
  }
  return {
    asPath,
    parsedAs,
    matchedPage,
    resolvedHref,
  }
}
