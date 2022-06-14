import type {
  Header,
  Redirect,
  Rewrite,
  RouteType,
} from '../lib/load-custom-routes'
import type { Route } from './router'
import type { BaseNextRequest } from './base-http'
import type { ParsedUrlQuery } from 'querystring'

import { getRedirectStatus, modifyRouteRegex } from '../lib/load-custom-routes'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import {
  compileNonPath,
  prepareDestination,
} from '../shared/lib/router/utils/prepare-destination'
import { getRequestMeta } from './request-meta'
import { stringify as stringifyQs } from 'querystring'
import { format as formatUrl } from 'url'
import { normalizeRepeatedSlashes } from '../shared/lib/utils'

export const getCustomRoute = ({
  type,
  rule,
  restrictedRedirectPaths,
}: {
  rule: Rewrite | Redirect | Header
  type: RouteType
  restrictedRedirectPaths: string[]
}) => {
  const match = getPathMatch(rule.source, {
    strict: true,
    removeUnnamedParams: true,
    regexModifier: !(rule as any).internal
      ? (regex: string) =>
          modifyRouteRegex(
            regex,
            type === 'redirect' ? restrictedRedirectPaths : undefined
          )
      : undefined,
  })

  return {
    ...rule,
    type,
    match,
    name: type,
    fn: async (_req, _res, _params, _parsedUrl) => ({ finished: false }),
  } as Route & Rewrite & Header
}

export const createHeaderRoute = ({
  rule,
  restrictedRedirectPaths,
}: {
  rule: Header
  restrictedRedirectPaths: string[]
}) => {
  const headerRoute = getCustomRoute({
    type: 'header',
    rule,
    restrictedRedirectPaths,
  })
  return {
    match: headerRoute.match,
    has: headerRoute.has,
    type: headerRoute.type,
    name: `${headerRoute.type} ${headerRoute.source} header route`,
    fn: async (_req, res, params, _parsedUrl) => {
      const hasParams = Object.keys(params).length > 0

      for (const header of (headerRoute as Header).headers) {
        let { key, value } = header
        if (hasParams) {
          key = compileNonPath(key, params)
          value = compileNonPath(value, params)
        }
        res.setHeader(key, value)
      }
      return { finished: false }
    },
  } as Route
}

export const createRedirectRoute = ({
  rule,
  restrictedRedirectPaths,
}: {
  rule: Redirect
  restrictedRedirectPaths: string[]
}) => {
  const redirectRoute = getCustomRoute({
    type: 'redirect',
    rule,
    restrictedRedirectPaths,
  })
  return {
    internal: redirectRoute.internal,
    type: redirectRoute.type,
    match: redirectRoute.match,
    has: redirectRoute.has,
    statusCode: redirectRoute.statusCode,
    name: `Redirect route ${redirectRoute.source}`,
    fn: async (req, res, params, parsedUrl) => {
      const { parsedDestination } = prepareDestination({
        appendParamsToQuery: false,
        destination: redirectRoute.destination,
        params: params,
        query: parsedUrl.query,
      })

      const { query } = parsedDestination
      delete (parsedDestination as any).query

      parsedDestination.search = stringifyQuery(req, query)

      let updatedDestination = formatUrl(parsedDestination)

      if (updatedDestination.startsWith('/')) {
        updatedDestination = normalizeRepeatedSlashes(updatedDestination)
      }

      res
        .redirect(
          updatedDestination,
          getRedirectStatus(redirectRoute as Redirect)
        )
        .body(updatedDestination)
        .send()

      return {
        finished: true,
      }
    },
  } as Route
}

// since initial query values are decoded by querystring.parse
// we need to re-encode them here but still allow passing through
// values from rewrites/redirects
export const stringifyQuery = (req: BaseNextRequest, query: ParsedUrlQuery) => {
  const initialQuery = getRequestMeta(req, '__NEXT_INIT_QUERY') || {}
  const initialQueryValues: Array<string | string[]> =
    Object.values(initialQuery)

  return stringifyQs(query, undefined, undefined, {
    encodeURIComponent(value) {
      if (
        value in initialQuery ||
        initialQueryValues.some((initialQueryVal: string | string[]) => {
          // `value` always refers to a query value, even if it's nested in an array
          return Array.isArray(initialQueryVal)
            ? initialQueryVal.includes(value)
            : initialQueryVal === value
        })
      ) {
        // Encode keys and values from initial query
        return encodeURIComponent(value)
      }

      return value
    },
  })
}
