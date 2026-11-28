import type { IncomingMessage } from 'http'
import type { Key } from 'next/dist/compiled/path-to-regexp'
import type { NextParsedUrlQuery } from '../../../../server/request-meta'
import type { RouteHas } from '../../../../lib/load-custom-routes'
import type { BaseNextRequest } from '../../../../server/base-http'

import { escapeStringRegexp } from '../../escape-regexp'
import { parseUrl, type ParsedUrl } from './parse-url'
import {
  INTERCEPTION_ROUTE_MARKERS,
  isInterceptionRouteAppPath,
} from './interception-routes'
import { getCookieParser } from '../../../../server/api-utils/get-cookie-parser'
import type { Params } from '../../../../server/request/params'
import { safePathToRegexp, safeCompile } from './route-match-utils'

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
  // Most params and query keys of a request are not named in the destination.
  // Without `:name` in it the replacement below returns the string as it is,
  // so the server does not build the expression for it.
  if (typeof window === 'undefined' && !str.includes(`:${segmentName}`)) {
    return str
  }
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
  return safeCompile(`/${value}`, { validate: false })(params).slice(1)
}

export function parseDestination(args: {
  destination: string
  params: Readonly<Params>
  query: Readonly<NextParsedUrlQuery>
}): ParsedUrl {
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

  let search = parsed.search
  if (search) {
    search = unescapeSegments(search)
  }

  let origin = parsed.origin
  if (origin) {
    origin = unescapeSegments(origin)
  }

  return {
    ...parsed,
    pathname,
    hostname,
    href,
    hash,
    search,
    origin,
  }
}

/**
 * What `prepareDestination` compiles from the path and the hostname of a
 * destination: the keys of its params and the function that fills them in.
 * Each depends only on the string and holds no state between calls, and the
 * strings come from the configuration, so they are kept by string. Without
 * this path-to-regexp parsed the path twice for every request that a
 * rewrite or a redirect applied to.
 *
 * Only the server keeps them. This module is also bundled for the browser
 * when a Pages Router app has rewrites or a middleware; there the calls
 * below are replaced by the plain ones at build time, which leaves that
 * bundle unchanged.
 */
const MAX_COMPILED_DESTINATIONS = 1000
let destinationKeys: Map<string, Key[]> | undefined
let destinationPathCompilers:
  | Map<string, ReturnType<typeof safeCompile>>
  | undefined
let destinationHostnameCompilers:
  | Map<string, ReturnType<typeof safeCompile>>
  | undefined

function collectDestinationKeys(value: string, keys: Key[]): void {
  destinationKeys ??= new Map()
  let valueKeys = destinationKeys.get(value)
  if (valueKeys === undefined) {
    valueKeys = []
    safePathToRegexp(value, valueKeys)
    if (destinationKeys.size < MAX_COMPILED_DESTINATIONS) {
      destinationKeys.set(value, valueKeys)
    }
  }
  for (let i = 0; i < valueKeys.length; i++) {
    keys.push(valueKeys[i])
  }
}

function getDestinationPathCompiler(destPath: string) {
  destinationPathCompilers ??= new Map()
  let compiler = destinationPathCompilers.get(destPath)
  if (compiler === undefined) {
    compiler = safeCompile(destPath, { validate: false })
    if (destinationPathCompilers.size < MAX_COMPILED_DESTINATIONS) {
      destinationPathCompilers.set(destPath, compiler)
    }
  }
  return compiler
}

function getDestinationHostnameCompiler(destHostname: string) {
  destinationHostnameCompilers ??= new Map()
  let compiler = destinationHostnameCompilers.get(destHostname)
  if (compiler === undefined) {
    compiler = safeCompile(destHostname, {
      validate: false,
      encode: encodeURIComponent,
    })
    if (destinationHostnameCompilers.size < MAX_COMPILED_DESTINATIONS) {
      destinationHostnameCompilers.set(destHostname, compiler)
    }
  }
  return compiler
}

export function prepareDestination(args: {
  appendParamsToQuery: boolean
  destination: string
  params: Params
  query: NextParsedUrlQuery
}) {
  const parsedDestination = parseDestination(args)

  const {
    hostname: destHostname,
    query: destQuery,
    search: destSearch,
  } = parsedDestination

  // The following code assumes that the pathname here includes the hash if it's
  // present.
  let destPath = parsedDestination.pathname
  if (parsedDestination.hash) {
    destPath = `${destPath}${parsedDestination.hash}`
  }

  const destParams: (string | number)[] = []

  const destPathParamKeys: Key[] = []
  if (typeof window === 'undefined') {
    collectDestinationKeys(destPath, destPathParamKeys)
  } else {
    safePathToRegexp(destPath, destPathParamKeys)
  }
  for (const key of destPathParamKeys) {
    destParams.push(key.name)
  }

  if (destHostname) {
    const destHostnameParamKeys: Key[] = []
    if (typeof window === 'undefined') {
      collectDestinationKeys(destHostname, destHostnameParamKeys)
    } else {
      safePathToRegexp(destHostname, destHostnameParamKeys)
    }
    for (const key of destHostnameParamKeys) {
      destParams.push(key.name)
    }
  }

  const destPathCompiler =
    typeof window === 'undefined'
      ? getDestinationPathCompiler(destPath)
      : safeCompile(
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
    destHostnameCompiler =
      typeof window === 'undefined'
        ? getDestinationHostnameCompiler(destHostname)
        : safeCompile(destHostname, {
            validate: false,
            encode: encodeURIComponent,
          })
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
    parsedDestination.search = destSearch
      ? compileNonPath(destSearch, args.params)
      : ''
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
    ...args.query,
    ...parsedDestination.query,
  }

  return {
    newUrl,
    destQuery,
    parsedDestination,
  }
}
