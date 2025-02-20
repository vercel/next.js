import type { ParsedUrlQuery } from 'querystring'
import type { Rewrite } from '../../../../lib/load-custom-routes'
import { getPathMatch } from './path-match'
import { matchHas, prepareDestination } from './prepare-destination'
import { removeTrailingSlash } from './remove-trailing-slash'
import { normalizeLocalePath } from '../../i18n/normalize-locale-path'
import { removeBasePath } from '../../../../client/remove-base-path'
import { parseRelativeUrl, type ParsedRelativeUrl } from './parse-relative-url'

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
  locales?: readonly string[]
): {
  matchedPage: boolean
  parsedAs: ParsedRelativeUrl
  asPath: string
  resolvedHref?: string
  externalDest?: boolean
} {
  let matchedPage = false
  let externalDest = false
  let parsedAs = parseRelativeUrl(asPath)
  let fsPathname = removeTrailingSlash(
    normalizeLocalePath(removeBasePath(parsedAs.pathname), locales).pathname
  )
  let resolvedHref

  const handleRewrite = (rewrite: Rewrite) => {
    const matcher = getPathMatch(
      rewrite.source + (process.env.__NEXT_TRAILING_SLASH ? '(/)?' : ''),
      {
        removeUnnamedParams: true,
        strict: true,
      }
    )

    let params = matcher(parsedAs.pathname)

    if ((rewrite.has || rewrite.missing) && params) {
      const hasParams = matchHas(
        {
          headers: {
            host: document.location.hostname,
            'user-agent': navigator.userAgent,
          },
          cookies: document.cookie
            .split('; ')
            .reduce<Record<string, string>>((acc, item) => {
              const [key, ...value] = item.split('=')
              acc[key] = value.join('=')
              return acc
            }, {}),
        } as any,
        parsedAs.query,
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
      if (!rewrite.destination) {
        // this is a proxied rewrite which isn't handled on the client
        externalDest = true
        return true
      }
      const destRes = prepareDestination({
        appendParamsToQuery: true,
        destination: rewrite.destination,
        params: params,
        query: query,
      })
      parsedAs = destRes.parsedDestination
      asPath = destRes.newUrl
      Object.assign(query, destRes.parsedDestination.query)

      fsPathname = removeTrailingSlash(
        normalizeLocalePath(removeBasePath(asPath), locales).pathname
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
    externalDest,
  }
}
