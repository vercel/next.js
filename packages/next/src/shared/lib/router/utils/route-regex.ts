import { escapeStringRegexp } from '../../escape-regexp'
import { removeTrailingSlash } from './remove-trailing-slash'

export interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export interface RouteRegex {
  groups: { [groupName: string]: Group }
  re: RegExp
}

/**
 * Parses a given parameter from a route to a data structure that can be used
 * to generate the parametrized route. Examples:
 *   - `[...slug]` -> `{ name: 'slug', repeat: true, optional: true }`
 *   - `[foo]` -> `{ name: 'foo', repeat: false, optional: true }`
 *   - `bar` -> `{ name: 'bar', repeat: false, optional: false }`
 */
function parseParameter(param: string) {
  const optional = param.startsWith('[') && param.endsWith(']')
  if (optional) {
    param = param.slice(1, -1)
  }
  const repeat = param.startsWith('...')
  if (repeat) {
    param = param.slice(3)
  }
  return { key: param, repeat, optional }
}

function getParametrizedRoute(route: string) {
  const segments = removeTrailingSlash(route).slice(1).split('/')
  const groups: { [groupName: string]: Group } = {}
  let groupIndex = 1
  return {
    parameterizedRoute: segments
      .map((segment) => {
        if (segment.startsWith('[') && segment.endsWith(']')) {
          const { key, optional, repeat } = parseParameter(segment.slice(1, -1))
          groups[key] = { pos: groupIndex++, repeat, optional }
          return repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
        } else {
          return `/${escapeStringRegexp(segment)}`
        }
      })
      .join(''),
    groups,
  }
}

/**
 * From a normalized route this function generates a regular expression and
 * a corresponding groups object intended to be used to store matching groups
 * from the regular expression.
 */
export function getRouteRegex(normalizedRoute: string): RouteRegex {
  const { parameterizedRoute, groups } = getParametrizedRoute(normalizedRoute)
  return {
    re: new RegExp(`^${parameterizedRoute}(?:/)?$`),
    groups: groups,
  }
}

/**
 * Builds a function to generate a minimal routeKey using only a-z and minimal
 * number of characters.
 */
function buildGetSafeRouteKey() {
  let routeKeyCharCode = 97
  let routeKeyCharLength = 1

  return () => {
    let routeKey = ''
    for (let i = 0; i < routeKeyCharLength; i++) {
      routeKey += String.fromCharCode(routeKeyCharCode)
      routeKeyCharCode++

      if (routeKeyCharCode > 122) {
        routeKeyCharLength++
        routeKeyCharCode = 97
      }
    }
    return routeKey
  }
}

function getNamedParametrizedRoute(route: string) {
  const segments = removeTrailingSlash(route).slice(1).split('/')
  const getSafeRouteKey = buildGetSafeRouteKey()
  const routeKeys: { [named: string]: string } = {}
  return {
    namedParameterizedRoute: segments
      .map((segment) => {
        if (segment.startsWith('[') && segment.endsWith(']')) {
          const { key, optional, repeat } = parseParameter(segment.slice(1, -1))
          // replace any non-word characters since they can break
          // the named regex
          let cleanedKey = key.replace(/\W/g, '')
          let invalidKey = false

          // check if the key is still invalid and fallback to using a known
          // safe key
          if (cleanedKey.length === 0 || cleanedKey.length > 30) {
            invalidKey = true
          }
          if (!isNaN(parseInt(cleanedKey.slice(0, 1)))) {
            invalidKey = true
          }

          if (invalidKey) {
            cleanedKey = getSafeRouteKey()
          }

          routeKeys[cleanedKey] = key
          return repeat
            ? optional
              ? `(?:/(?<${cleanedKey}>.+?))?`
              : `/(?<${cleanedKey}>.+?)`
            : `/(?<${cleanedKey}>[^/]+?)`
        } else {
          return `/${escapeStringRegexp(segment)}`
        }
      })
      .join(''),
    routeKeys,
  }
}

/**
 * This function extends `getRouteRegex` generating also a named regexp where
 * each group is named along with a routeKeys object that indexes the assigned
 * named group with its corresponding key.
 */
export function getNamedRouteRegex(normalizedRoute: string) {
  const result = getNamedParametrizedRoute(normalizedRoute)
  return {
    ...getRouteRegex(normalizedRoute),
    namedRegex: `^${result.namedParameterizedRoute}(?:/)?$`,
    routeKeys: result.routeKeys,
  }
}

/**
 * Generates a named regexp.
 * This is intended to be using for build time only.
 */
export function getNamedMiddlewareRegex(
  normalizedRoute: string,
  options: {
    catchAll?: boolean
  }
) {
  const { parameterizedRoute } = getParametrizedRoute(normalizedRoute)
  const { catchAll = true } = options
  if (parameterizedRoute === '/') {
    let catchAllRegex = catchAll ? '.*' : ''
    return {
      namedRegex: `^/${catchAllRegex}$`,
    }
  }

  const { namedParameterizedRoute } = getNamedParametrizedRoute(normalizedRoute)
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''
  return {
    namedRegex: `^${namedParameterizedRoute}${catchAllGroupedRegex}$`,
  }
}
