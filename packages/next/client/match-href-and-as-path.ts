import type { Effect } from './with-middleware-effects'
import type { ParsedUrlQuery } from 'querystring'
import { formatWithValidation } from '../shared/lib/router/utils/format-url'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { interpolateAs } from '../shared/lib/router/router'
import { omit } from '../shared/lib/omit'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'

interface Params {
  asPath: string
  getData: () => Promise<{ effect?: Effect } | null>
  href: { pathname: string; query: ParsedUrlQuery }
}

export async function matchHrefAndAsPath(params: Params) {
  const result = runMatch(params)
  if (result.error === 'mismatch') {
    const data = await params.getData()
    if (data?.effect?.type === 'rewrite') {
      return {
        effect: data.effect,
        ...runMatch({
          asPath: data.effect.parsedAs.pathname,
          href: {
            pathname: data.effect.resolvedHref,
            query: { ...params.href.query, ...data.effect.parsedAs.query },
          },
        }),
      }
    }
  }

  return result
}

function runMatch({ asPath, href }: Pick<Params, 'asPath' | 'href'>) {
  const { pathname, query } = href
  const route = removeTrailingSlash(pathname)
  const regex = getRouteRegex(route)
  const parsedAs = parseRelativeUrl(asPath)
  const routeMatch = getRouteMatcher(regex)(parsedAs.pathname)
  if (!routeMatch) {
    return {
      error: 'mismatch' as const,
      asPathname: parsedAs.pathname,
      missingParams: Object.keys(regex.groups).filter((key) => !query[key]),
    }
  }

  if (route === parsedAs.pathname) {
    const interpolated = interpolateAs(route, parsedAs.pathname, query)
    if (!interpolated?.result) {
      return {
        error: 'interpolate' as const,
        missingParams: Object.keys(regex.groups).filter((key) => !query[key]),
      }
    }

    return {
      as: formatWithValidation(
        Object.assign({}, parsedAs, {
          pathname: interpolated.result,
          query: omit(query, interpolated.params!),
        })
      ),
    }
  }

  return { routeMatch }
}
