import { ParsedUrlQuery } from 'querystring'
import pathMatch from './path-match'
import prepareDestination, { matchHas } from './prepare-destination'
import { Rewrite } from '../../../../lib/load-custom-routes'
import { removePathTrailingSlash } from '../../../../client/normalize-trailing-slash'
import { normalizeLocalePath } from '../../i18n/normalize-locale-path'
import { parseRelativeUrl } from './parse-relative-url'
import { delBasePath } from '../router'

const customRouteMatcher = pathMatch(true)

export default function resolveRewrites(
  asPath: string,
  pages: string[],
  rewrites: {
    beforeFiles: Rewrite[]
    afterFiles: Rewrite[]
    fallback: Rewrite[]
  },
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

  const handleRewrite = (rewrite: Rewrite) => {
    const matcher = customRouteMatcher(rewrite.source)
    let params = matcher(parsedAs.pathname)

    if (rewrite.has && params) {
      const hasParams = matchHas(
        {
          headers: {
            host: document.location.hostname,
          },
          cookies: document.cookie
            .split('; ')
            .reduce<Record<string, string>>((acc, item) => {
              const [key, ...value] = item.split('=')
              acc[key] = value.join('=')
              return acc
            }, {}),
        } as any,
        rewrite.has,
        parsedAs.query
      )

      if (hasParams) {
        Object.assign(params, hasParams)
      } else {
        params = false
      }
    }

    if (params) {
      if (!rewrite.destination) {
        // this is a proxied rewrite which isn't handled on the client
        return true
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
        return true
      }

      // check if we match a dynamic-route, if so we break the rewrites chain
      resolvedHref = resolveHref(fsPathname)

      if (resolvedHref !== asPath && pages.includes(resolvedHref)) {
        matchedPage = true
        return true
      }
    }
  }
  let finished = false

  for (let i = 0; i < rewrites.beforeFiles.length; i++) {
    // we don't end after match in beforeFiles to allow
    // continuing through all beforeFiles rewrites
    handleRewrite(rewrites.beforeFiles[i])
  }
  matchedPage = pages.includes(fsPathname)

  if (!matchedPage) {
    if (!finished) {
      for (let i = 0; i < rewrites.afterFiles.length; i++) {
        if (handleRewrite(rewrites.afterFiles[i])) {
          finished = true
          break
        }
      }
    }

    // check dynamic route before processing fallback rewrites
    if (!finished) {
      resolvedHref = resolveHref(fsPathname)
      matchedPage = pages.includes(resolvedHref)
      finished = matchedPage
    }

    if (!finished) {
      for (let i = 0; i < rewrites.fallback.length; i++) {
        if (handleRewrite(rewrites.fallback[i])) {
          finished = true
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
