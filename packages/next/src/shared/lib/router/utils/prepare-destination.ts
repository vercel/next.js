import type { IncomingMessage } from 'http'
import type { Key } from 'next/dist/compiled/path-to-regexp'
import type { NextParsedUrlQuery } from '../../../../server/request-meta'
import type { RouteHas } from '../../../../lib/load-custom-routes'
import type { BaseNextRequest } from '../../../../server/base-http'

import { compile, pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { escapeStringRegexp } from '../../escape-regexp'
import { parseUrl } from './parse-url'
import {
  INTERCEPTION_ROUTE_MARKERS,
  isInterceptionRouteAppPath,
} from '../../../../server/lib/interception-routes'
import { NEXT_RSC_UNION_QUERY } from '../../../../client/components/app-router-headers'
import { getCookieParser } from '../../../../server/api-utils/get-cookie-parser'
import type { Params } from '../../../../server/request/params'

/**
 * Ensure only a-zA-Z are used for param names for proper interpolating
 * with path-to-regexp
 */
function getSafeParamName(paramName: string) {
  let newParamName = ''

  for (let i = 0; i < paramName.length; i++) {
    const charCode = paramName.charCodeAt(i)

    if (
      (charCode > 64 && charCode < 91) || // A-Z
      (charCode > 96 && charCode < 123) // a-z
    ) {
      newParamName += paramName[i]
    }
  }
  return newParamName
}

function escapeSegment(str: string, segmentName: string) {
  return str.replace(
    new RegExp(`:${escapeStringRegexp(segmentName)}`, 'g'),
    `__ESC_COLON_${segmentName}`
  )
}

function unescapeSegments(str: string) {
  return str.replace(/__ESC_COLON_/gi, ':')
}

export function matchHas(
  req: BaseNextRequest | IncomingMessage,
  query: Params,
  has: RouteHas[] = [],
  missing: RouteHas[] = []
): false | Params {
  const params: Params = {}

  const hasMatch = (hasItem: RouteHas) => {
    let value
    let key = hasItem.key

    switch (hasItem.type) {
      case 'header': {
        key = key!.toLowerCase()
        value = req.headers[key] as string
        break
      }
      case 'cookie': {
        if ('cookies' in req) {
          value = req.cookies[hasItem.key]
        } else {
          const cookies = getCookieParser(req.headers)()
          value = cookies[hasItem.key]
        }

        break
      }
      case 'query': {
        value = query[key!]
        break
      }
      case 'host': {
        const { host } = req?.headers || {}
        // remove port from host if present
        const hostname = host?.split(':', 1)[0].toLowerCase()
        value = hostname
        break
      }
      default: {
        break
      }
    }

    if (!hasItem.value && value) {
      params[getSafeParamName(key!)] = value
      return true
    } else if (value) {
      const matcher = new RegExp(`^${hasItem.value}$`)
      const matches = Array.isArray(value)
        ? value.slice(-1)[0].match(matcher)
        : value.match(matcher)

      if (matches) {
        if (Array.isArray(matches)) {
          if (matches.groups) {
            Object.keys(matches.groups).forEach((groupKey) => {
              params[groupKey] = matches.groups![groupKey]
            })
          } else if (hasItem.type === 'host' && matches[0]) {
            params.host = matches[0]
          }
        }
        return true
      }
    }
    return false
  }

  const allMatch =
    has.every((item) => hasMatch(item)) &&
    !missing.some((item) => hasMatch(item))

  if (allMatch) {
    return params
  }
  return false
}

export function compileNonPath(value: string, params: Params): string {
  if (!value.includes(':')) {
    return value
  }

  for (const key of Object.keys(params)) {
    if (value.includes(`:${key}`)) {
      value = value
        .replace(
          new RegExp(`:${key}\\*`, 'g'),
          `:${key}--ESCAPED_PARAM_ASTERISKS`
        )
        .replace(
          new RegExp(`:${key}\\?`, 'g'),
          `:${key}--ESCAPED_PARAM_QUESTION`
        )
        .replace(new RegExp(`:${key}\\+`, 'g'), `:${key}--ESCAPED_PARAM_PLUS`)
        .replace(
          new RegExp(`:${key}(?!\\w)`, 'g'),
          `--ESCAPED_PARAM_COLON${key}`
        )
    }
  }
  value = value
    .replace(/(:|\*|\?|\+|\(|\)|\{|\})/g, '\\$1')
    .replace(/--ESCAPED_PARAM_PLUS/g, '+')
    .replace(/--ESCAPED_PARAM_COLON/g, ':')
    .replace(/--ESCAPED_PARAM_QUESTION/g, '?')
    .replace(/--ESCAPED_PARAM_ASTERISKS/g, '*')

  // the value needs to start with a forward-slash to be compiled
  // correctly
  return compile(`/${value}`, { validate: false })(params).slice(1)
}

export function parseDestination(args: {
  destination: string
  params: Readonly<Params>
  query: Readonly<NextParsedUrlQuery>
}) {
  let escaped = args.destination
  for (const param of Object.keys({ ...args.params, ...args.query })) {
    if (!param) continue

    escaped = escapeSegment(escaped, param)
  }

  const parsed = parseUrl(escaped)

  let pathname = parsed.pathname
  if (pathname) {
    pathname = unescapeSegments(pathname)
  }

  let href = parsed.href
  if (href) {
    href = unescapeSegments(href)
  }

  let hostname = parsed.hostname
  if (hostname) {
    hostname = unescapeSegments(hostname)
  }

  let hash = parsed.hash
  if (hash) {
    hash = unescapeSegments(hash)
  }

  return {
    ...parsed,
    pathname,
    hostname,
    href,
    hash,
  }
}

export function prepareDestination(args: {
  appendParamsToQuery: boolean
  destination: string
  params: Params
  query: NextParsedUrlQuery
}) {
  const query = Object.assign({}, args.query)
  delete query[NEXT_RSC_UNION_QUERY]

  const parsedDestination = parseDestination(args)

  const { hostname: destHostname, query: destQuery } = parsedDestination

  // The following code assumes that the pathname here includes the hash if it's
  // present.
  let destPath = parsedDestination.pathname
  if (parsedDestination.hash) {
    destPath = `${destPath}${parsedDestination.hash}`
  }

  const destParams: (string | number)[] = []

  const destPathParamKeys: Key[] = []
  pathToRegexp(destPath, destPathParamKeys)
  for (const key of destPathParamKeys) {
    destParams.push(key.name)
  }

  if (destHostname) {
    const destHostnameParamKeys: Key[] = []
    pathToRegexp(destHostname, destHostnameParamKeys)
    for (const key of destHostnameParamKeys) {
      destParams.push(key.name)
    }
  }

  const destPathCompiler = compile(
    destPath,
    // we don't validate while compiling the destination since we should
    // have already validated before we got to this point and validating
    // breaks compiling destinations with named pattern params from the source
    // e.g. /something:hello(.*) -> /another/:hello is broken with validation
    // since compile validation is meant for reversing and not for inserting
    // params from a separate path-regex into another
    { validate: false }
  )

  let destHostnameCompiler
  if (destHostname) {
    destHostnameCompiler = compile(destHostname, { validate: false })
  }

  // update any params in query values
  for (const [key, strOrArray] of Object.entries(destQuery)) {
    // the value needs to start with a forward-slash to be compiled
    // correctly
    if (Array.isArray(strOrArray)) {
      destQuery[key] = strOrArray.map((value) =>
        compileNonPath(unescapeSegments(value), args.params)
      )
    } else if (typeof strOrArray === 'string') {
      destQuery[key] = compileNonPath(unescapeSegments(strOrArray), args.params)
    }
  }

  // add path params to query if it's not a redirect and not
  // already defined in destination query or path
  let paramKeys = Object.keys(args.params).filter(
    (name) => name !== 'nextInternalLocale'
  )

  if (
    args.appendParamsToQuery &&
    !paramKeys.some((key) => destParams.includes(key))
  ) {
    for (const key of paramKeys) {
      if (!(key in destQuery)) {
        destQuery[key] = args.params[key]
      }
    }
  }

  let newUrl

  // The compiler also that the interception route marker is an unnamed param, hence '0',
  // so we need to add it to the params object.
  if (isInterceptionRouteAppPath(destPath)) {
    for (const segment of destPath.split('/')) {
      const marker = INTERCEPTION_ROUTE_MARKERS.find((m) =>
        segment.startsWith(m)
      )
      if (marker) {
        if (marker === '(..)(..)') {
          args.params['0'] = '(..)'
          args.params['1'] = '(..)'
        } else {
          args.params['0'] = marker
        }
        break
      }
    }
  }

  try {
    newUrl = destPathCompiler(args.params)

    const [pathname, hash] = newUrl.split('#', 2)
    if (destHostnameCompiler) {
      parsedDestination.hostname = destHostnameCompiler(args.params)
    }
    parsedDestination.pathname = pathname
    parsedDestination.hash = `${hash ? '#' : ''}${hash || ''}`
    delete (parsedDestination as any).search
  } catch (err: any) {
    if (err.message.match(/Expected .*? to not repeat, but got an array/)) {
      throw new Error(
        `To use a multi-match in the destination you must add \`*\` at the end of the param name to signify it should repeat. https://nextjs.org/docs/messages/invalid-multi-match`
      )
    }
    throw err
  }

  // Query merge order lowest priority to highest
  // 1. initial URL query values
  // 2. path segment values
  // 3. destination specified query values
  parsedDestination.query = {
    ...query,
    ...parsedDestination.query,
  }

  return {
    newUrl,
    destQuery,
    parsedDestination,
  }
}
