import chalk from 'chalk'
import { parse as parseUrl } from 'url'
import { NextConfig } from '../server/config'
import * as pathToRegexp from 'next/dist/compiled/path-to-regexp'
import escapeStringRegexp from 'next/dist/compiled/escape-string-regexp'
import {
  PERMANENT_REDIRECT_STATUS,
  TEMPORARY_REDIRECT_STATUS,
} from '../shared/lib/constants'

export type RouteHas =
  | {
      type: 'header' | 'query' | 'cookie'
      key: string
      value?: string
    }
  | {
      type: 'host'
      key?: undefined
      value: string
    }

export type Rewrite = {
  source: string
  destination: string
  basePath?: false
  locale?: false
  has?: RouteHas[]
}

export type Header = {
  source: string
  basePath?: false
  locale?: false
  headers: Array<{ key: string; value: string }>
  has?: RouteHas[]
}

// internal type used for validation (not user facing)
export type Redirect = {
  source: string
  destination: string
  basePath?: false
  locale?: false
  has?: RouteHas[]
  statusCode?: number
  permanent?: boolean
}

export const allowedStatusCodes = new Set([301, 302, 303, 307, 308])
const allowedHasTypes = new Set(['header', 'cookie', 'query', 'host'])
const namedGroupsRegex = /\(\?<([a-zA-Z][a-zA-Z0-9]*)>/g

export function getRedirectStatus(route: {
  statusCode?: number
  permanent?: boolean
}): number {
  return (
    route.statusCode ||
    (route.permanent ? PERMANENT_REDIRECT_STATUS : TEMPORARY_REDIRECT_STATUS)
  )
}

export function normalizeRouteRegex(regex: string) {
  // clean up un-necessary escaping from regex.source which turns / into \\/
  return regex.replace(/\\\//g, '/')
}

// for redirects we restrict matching /_next and for all routes
// we add an optional trailing slash at the end for easier
// configuring between trailingSlash: true/false
export function modifyRouteRegex(regex: string, restrictedPaths?: string[]) {
  if (restrictedPaths) {
    regex = regex.replace(
      /\^/,
      `^(?!${restrictedPaths
        .map((path) => path.replace(/\//g, '\\/'))
        .join('|')})`
    )
  }
  regex = regex.replace(/\$$/, '(?:\\/)?$')
  return regex
}

function checkRedirect(
  route: Redirect
): { invalidParts: string[]; hadInvalidStatus: boolean } {
  const invalidParts: string[] = []
  let hadInvalidStatus: boolean = false

  if (route.statusCode && !allowedStatusCodes.has(route.statusCode)) {
    hadInvalidStatus = true
    invalidParts.push(`\`statusCode\` is not undefined or valid statusCode`)
  }
  if (typeof route.permanent !== 'boolean' && !route.statusCode) {
    invalidParts.push(`\`permanent\` is not set to \`true\` or \`false\``)
  }

  return {
    invalidParts,
    hadInvalidStatus,
  }
}

function checkHeader(route: Header): string[] {
  const invalidParts: string[] = []

  if (!Array.isArray(route.headers)) {
    invalidParts.push('`headers` field must be an array')
  } else {
    for (const header of route.headers) {
      if (!header || typeof header !== 'object') {
        invalidParts.push(
          "`headers` items must be object with { key: '', value: '' }"
        )
        break
      }
      if (typeof header.key !== 'string') {
        invalidParts.push('`key` in header item must be string')
        break
      }
      if (typeof header.value !== 'string') {
        invalidParts.push('`value` in header item must be string')
        break
      }
    }
  }
  return invalidParts
}

type ParseAttemptResult = {
  error?: boolean
  tokens?: pathToRegexp.Token[]
}

function tryParsePath(route: string, handleUrl?: boolean): ParseAttemptResult {
  const result: ParseAttemptResult = {}
  let routePath = route

  try {
    if (handleUrl) {
      const parsedDestination = parseUrl(route, true)
      routePath = `${parsedDestination.pathname!}${
        parsedDestination.hash || ''
      }`
    }

    // Make sure we can parse the source properly
    result.tokens = pathToRegexp.parse(routePath)
    pathToRegexp.tokensToRegexp(result.tokens)
  } catch (err) {
    // If there is an error show our error link but still show original error or a formatted one if we can
    const errMatches = err.message.match(/at (\d{0,})/)

    if (errMatches) {
      const position = parseInt(errMatches[1], 10)
      console.error(
        `\nError parsing \`${route}\` ` +
          `https://nextjs.org/docs/messages/invalid-route-source\n` +
          `Reason: ${err.message}\n\n` +
          `  ${routePath}\n` +
          `  ${new Array(position).fill(' ').join('')}^\n`
      )
    } else {
      console.error(
        `\nError parsing ${route} https://nextjs.org/docs/messages/invalid-route-source`,
        err
      )
    }
    result.error = true
  }

  return result
}

export type RouteType = 'rewrite' | 'redirect' | 'header'

function checkCustomRoutes(
  routes: Redirect[] | Header[] | Rewrite[],
  type: RouteType
): void {
  if (!Array.isArray(routes)) {
    console.error(
      `Error: ${type}s must return an array, received ${typeof routes}.\n` +
        `See here for more info: https://nextjs.org/docs/messages/routes-must-be-array`
    )
    process.exit(1)
  }

  let numInvalidRoutes = 0
  let hadInvalidStatus = false
  let hadInvalidHas = false

  const allowedKeys = new Set<string>(['source', 'basePath', 'locale', 'has'])

  if (type === 'rewrite') {
    allowedKeys.add('destination')
  }
  if (type === 'redirect') {
    allowedKeys.add('statusCode')
    allowedKeys.add('permanent')
    allowedKeys.add('destination')
  }
  if (type === 'header') {
    allowedKeys.add('headers')
  }

  for (const route of routes) {
    if (!route || typeof route !== 'object') {
      console.error(
        `The route ${JSON.stringify(
          route
        )} is not a valid object with \`source\` and \`${
          type === 'header' ? 'headers' : 'destination'
        }\``
      )
      numInvalidRoutes++
      continue
    }

    if (
      type === 'rewrite' &&
      (route as Rewrite).basePath === false &&
      !(
        (route as Rewrite).destination.startsWith('http://') ||
        (route as Rewrite).destination.startsWith('https://')
      )
    ) {
      console.error(
        `The route ${
          (route as Rewrite).source
        } rewrites urls outside of the basePath. Please use a destination that starts with \`http://\` or \`https://\` https://nextjs.org/docs/messages/invalid-external-rewrite`
      )
      numInvalidRoutes++
      continue
    }

    const keys = Object.keys(route)
    const invalidKeys = keys.filter((key) => !allowedKeys.has(key))
    const invalidParts: string[] = []

    if (typeof route.basePath !== 'undefined' && route.basePath !== false) {
      invalidParts.push('`basePath` must be undefined or false')
    }

    if (typeof route.locale !== 'undefined' && route.locale !== false) {
      invalidParts.push('`locale` must be undefined or false')
    }

    if (typeof route.has !== 'undefined' && !Array.isArray(route.has)) {
      invalidParts.push('`has` must be undefined or valid has object')
      hadInvalidHas = true
    } else if (route.has) {
      const invalidHasItems = []

      for (const hasItem of route.has) {
        let invalidHasParts = []

        if (!allowedHasTypes.has(hasItem.type)) {
          invalidHasParts.push(`invalid type "${hasItem.type}"`)
        }
        if (typeof hasItem.key !== 'string' && hasItem.type !== 'host') {
          invalidHasParts.push(`invalid key "${hasItem.key}"`)
        }
        if (
          typeof hasItem.value !== 'undefined' &&
          typeof hasItem.value !== 'string'
        ) {
          invalidHasParts.push(`invalid value "${hasItem.value}"`)
        }
        if (typeof hasItem.value === 'undefined' && hasItem.type === 'host') {
          invalidHasParts.push(`value is required for "host" type`)
        }

        if (invalidHasParts.length > 0) {
          invalidHasItems.push(
            `${invalidHasParts.join(', ')} for ${JSON.stringify(hasItem)}`
          )
        }
      }

      if (invalidHasItems.length > 0) {
        hadInvalidHas = true
        const itemStr = `item${invalidHasItems.length === 1 ? '' : 's'}`

        console.error(
          `Invalid \`has\` ${itemStr}:\n` + invalidHasItems.join('\n')
        )
        console.error()
        invalidParts.push(`invalid \`has\` ${itemStr} found`)
      }
    }

    if (!route.source) {
      invalidParts.push('`source` is missing')
    } else if (typeof route.source !== 'string') {
      invalidParts.push('`source` is not a string')
    } else if (!route.source.startsWith('/')) {
      invalidParts.push('`source` does not start with /')
    }

    if (type === 'header') {
      invalidParts.push(...checkHeader(route as Header))
    } else {
      let _route = route as Rewrite | Redirect
      if (!_route.destination) {
        invalidParts.push('`destination` is missing')
      } else if (typeof _route.destination !== 'string') {
        invalidParts.push('`destination` is not a string')
      } else if (
        type === 'rewrite' &&
        !_route.destination.match(/^(\/|https:\/\/|http:\/\/)/)
      ) {
        invalidParts.push(
          '`destination` does not start with `/`, `http://`, or `https://`'
        )
      }
    }

    if (type === 'redirect') {
      const result = checkRedirect(route as Redirect)
      hadInvalidStatus = hadInvalidStatus || result.hadInvalidStatus
      invalidParts.push(...result.invalidParts)
    }

    let sourceTokens: pathToRegexp.Token[] | undefined

    if (typeof route.source === 'string' && route.source.startsWith('/')) {
      // only show parse error if we didn't already show error
      // for not being a string
      const { tokens, error } = tryParsePath(route.source)

      if (error) {
        invalidParts.push('`source` parse failed')
      }
      sourceTokens = tokens
    }
    const hasSegments = new Set<string>()

    if (route.has) {
      for (const hasItem of route.has) {
        if (!hasItem.value && hasItem.key) {
          hasSegments.add(hasItem.key)
        }

        if (hasItem.value) {
          for (const match of hasItem.value.matchAll(namedGroupsRegex)) {
            if (match[1]) {
              hasSegments.add(match[1])
            }
          }

          if (hasItem.type === 'host') {
            hasSegments.add('host')
          }
        }
      }
    }

    // make sure no unnamed patterns are attempted to be used in the
    // destination as this can cause confusion and is not allowed
    if (typeof (route as Rewrite).destination === 'string') {
      if (
        (route as Rewrite).destination.startsWith('/') &&
        Array.isArray(sourceTokens)
      ) {
        const unnamedInDest = new Set()

        for (const token of sourceTokens) {
          if (typeof token === 'object' && typeof token.name === 'number') {
            const unnamedIndex = new RegExp(`:${token.name}(?!\\d)`)
            if ((route as Rewrite).destination.match(unnamedIndex)) {
              unnamedInDest.add(`:${token.name}`)
            }
          }
        }

        if (unnamedInDest.size > 0) {
          invalidParts.push(
            `\`destination\` has unnamed params ${[...unnamedInDest].join(
              ', '
            )}`
          )
        } else {
          const {
            tokens: destTokens,
            error: destinationParseFailed,
          } = tryParsePath((route as Rewrite).destination, true)

          if (destinationParseFailed) {
            invalidParts.push('`destination` parse failed')
          } else {
            const sourceSegments = new Set(
              sourceTokens
                .map((item) => typeof item === 'object' && item.name)
                .filter(Boolean)
            )
            const invalidDestSegments = new Set()

            for (const token of destTokens!) {
              if (
                typeof token === 'object' &&
                !sourceSegments.has(token.name) &&
                !hasSegments.has(token.name as string)
              ) {
                invalidDestSegments.add(token.name)
              }
            }

            if (invalidDestSegments.size) {
              invalidParts.push(
                `\`destination\` has segments not in \`source\` or \`has\` (${[
                  ...invalidDestSegments,
                ].join(', ')})`
              )
            }
          }
        }
      }
    }

    const hasInvalidKeys = invalidKeys.length > 0
    const hasInvalidParts = invalidParts.length > 0

    if (hasInvalidKeys || hasInvalidParts) {
      console.error(
        `${invalidParts.join(', ')}${
          invalidKeys.length
            ? (hasInvalidParts ? ',' : '') +
              ` invalid field${invalidKeys.length === 1 ? '' : 's'}: ` +
              invalidKeys.join(',')
            : ''
        } for route ${JSON.stringify(route)}`
      )
      console.error()
      numInvalidRoutes++
    }
  }

  if (numInvalidRoutes > 0) {
    if (hadInvalidStatus) {
      console.error(
        `\nValid redirect statusCode values are ${[...allowedStatusCodes].join(
          ', '
        )}`
      )
    }
    if (hadInvalidHas) {
      console.error(
        `\nValid \`has\` object shape is ${JSON.stringify(
          {
            type: [...allowedHasTypes].join(', '),
            key: 'the key to check for',
            value: 'undefined or a value string to match against',
          },
          null,
          2
        )}`
      )
    }
    console.error()
    console.error(
      `Error: Invalid ${type}${numInvalidRoutes === 1 ? '' : 's'} found`
    )
    process.exit(1)
  }
}

export interface CustomRoutes {
  headers: Header[]
  rewrites: {
    fallback: Rewrite[]
    afterFiles: Rewrite[]
    beforeFiles: Rewrite[]
  }
  redirects: Redirect[]
}

function processRoutes<T>(
  routes: T,
  config: NextConfig,
  type: 'redirect' | 'rewrite' | 'header'
): T {
  const _routes = (routes as any) as Array<{
    source: string
    locale?: false
    basePath?: false
    destination?: string
  }>
  const newRoutes: typeof _routes = []
  const defaultLocales: Array<{
    locale: string
    base: string
  }> = []

  if (config.i18n && type === 'redirect') {
    for (const item of config.i18n?.domains || []) {
      defaultLocales.push({
        locale: item.defaultLocale,
        base: `http${item.http ? '' : 's'}://${item.domain}`,
      })
    }

    defaultLocales.push({
      locale: config.i18n.defaultLocale,
      base: '',
    })
  }

  for (const r of _routes) {
    const srcBasePath =
      config.basePath && r.basePath !== false ? config.basePath : ''
    const isExternal = !r.destination?.startsWith('/')
    const destBasePath = srcBasePath && !isExternal ? srcBasePath : ''

    if (config.i18n && r.locale !== false) {
      defaultLocales.forEach((item) => {
        let destination

        if (r.destination) {
          destination = item.base
            ? `${item.base}${destBasePath}${r.destination}`
            : `${destBasePath}${r.destination}`
        }

        newRoutes.push({
          ...r,
          destination,
          source: `${srcBasePath}/${item.locale}${r.source}`,
        })
      })

      r.source = `/:nextInternalLocale(${config.i18n.locales
        .map((locale: string) => escapeStringRegexp(locale))
        .join('|')})${
        r.source === '/' && !config.trailingSlash ? '' : r.source
      }`

      if (r.destination && r.destination?.startsWith('/')) {
        r.destination = `/:nextInternalLocale${
          r.destination === '/' && !config.trailingSlash ? '' : r.destination
        }`
      }
    }
    r.source = `${srcBasePath}${
      r.source === '/' && srcBasePath ? '' : r.source
    }`

    if (r.destination) {
      r.destination = `${destBasePath}${
        r.destination === '/' && destBasePath ? '' : r.destination
      }`
    }
    newRoutes.push(r)
  }
  return (newRoutes as any) as T
}

async function loadRedirects(config: NextConfig) {
  if (typeof config.redirects !== 'function') {
    return []
  }
  let redirects = await config.redirects()
  checkCustomRoutes(redirects, 'redirect')
  return processRoutes(redirects, config, 'redirect')
}

async function loadRewrites(config: NextConfig) {
  if (typeof config.rewrites !== 'function') {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  }
  const _rewrites = await config.rewrites()
  let beforeFiles: Rewrite[] = []
  let afterFiles: Rewrite[] = []
  let fallback: Rewrite[] = []

  if (
    !Array.isArray(_rewrites) &&
    typeof _rewrites === 'object' &&
    Object.keys(_rewrites).every(
      (key) =>
        key === 'beforeFiles' || key === 'afterFiles' || key === 'fallback'
    )
  ) {
    beforeFiles = _rewrites.beforeFiles || []
    afterFiles = _rewrites.afterFiles || []
    fallback = _rewrites.fallback || []
  } else {
    afterFiles = _rewrites as any
  }

  checkCustomRoutes(beforeFiles, 'rewrite')
  checkCustomRoutes(afterFiles, 'rewrite')
  checkCustomRoutes(fallback, 'rewrite')

  return {
    beforeFiles: processRoutes(beforeFiles, config, 'rewrite'),
    afterFiles: processRoutes(afterFiles, config, 'rewrite'),
    fallback: processRoutes(fallback, config, 'rewrite'),
  }
}

async function loadHeaders(config: NextConfig) {
  if (typeof config.headers !== 'function') {
    return []
  }
  let headers = await config.headers()
  checkCustomRoutes(headers, 'header')
  return processRoutes(headers, config, 'header')
}

export default async function loadCustomRoutes(
  config: NextConfig
): Promise<CustomRoutes> {
  const [headers, rewrites, redirects] = await Promise.all([
    loadHeaders(config),
    loadRewrites(config),
    loadRedirects(config),
  ])

  const totalRewrites =
    rewrites.beforeFiles.length +
    rewrites.afterFiles.length +
    rewrites.fallback.length

  const totalRoutes = headers.length + redirects.length + totalRewrites

  if (totalRoutes > 1000) {
    console.warn(
      chalk.bold.yellow(`Warning: `) +
        `total number of custom routes exceeds 1000, this can reduce performance. Route counts:\n` +
        `headers: ${headers.length}\n` +
        `rewrites: ${totalRewrites}\n` +
        `redirects: ${redirects.length}\n` +
        `See more info: https://nextjs.org/docs/messages/max-custom-routes-reached`
    )
  }

  if (config.trailingSlash) {
    redirects.unshift(
      {
        source: '/:file((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/]+\\.\\w+)/',
        destination: '/:file',
        permanent: true,
        locale: config.i18n ? false : undefined,
        internal: true,
      } as Redirect,
      {
        source: '/:notfile((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/\\.]+)',
        destination: '/:notfile/',
        permanent: true,
        locale: config.i18n ? false : undefined,
        internal: true,
      } as Redirect
    )
    if (config.basePath) {
      redirects.unshift({
        source: config.basePath,
        destination: config.basePath + '/',
        permanent: true,
        basePath: false,
        locale: config.i18n ? false : undefined,
        internal: true,
      } as Redirect)
    }
  } else {
    redirects.unshift({
      source: '/:path+/',
      destination: '/:path+',
      permanent: true,
      locale: config.i18n ? false : undefined,
      internal: true,
    } as Redirect)
    if (config.basePath) {
      redirects.unshift({
        source: config.basePath + '/',
        destination: config.basePath,
        permanent: true,
        basePath: false,
        locale: config.i18n ? false : undefined,
        internal: true,
      } as Redirect)
    }
  }

  return {
    headers,
    rewrites,
    redirects,
  }
}
