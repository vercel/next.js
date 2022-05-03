import { escapeStringRegexp } from '../../escape-regexp'

interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export function getParametrizedRoute(route: string) {
  const segments = (route.replace(/\/$/, '') || '/').slice(1).split('/')

  const groups: { [groupName: string]: Group } = {}
  let groupIndex = 1
  const parameterizedRoute = segments
    .map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const { key, optional, repeat } = parseParameter(segment.slice(1, -1))
        groups[key] = { pos: groupIndex++, repeat, optional }
        return repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
      } else {
        return `/${escapeStringRegexp(segment)}`
      }
    })
    .join('')

  // dead code eliminate for browser since it's only needed
  // while generating routes-manifest
  if (typeof window === 'undefined') {
    let routeKeyCharCode = 97
    let routeKeyCharLength = 1

    // builds a minimal routeKey using only a-z and minimal number of characters
    const getSafeRouteKey = () => {
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

    const routeKeys: { [named: string]: string } = {}

    let namedParameterizedRoute = segments
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
      .join('')

    return {
      parameterizedRoute,
      namedParameterizedRoute,
      groups,
      routeKeys,
    }
  }

  return {
    parameterizedRoute,
    groups,
  }
}

export interface RouteRegex {
  groups: { [groupName: string]: Group }
  namedRegex?: string
  re: RegExp
  routeKeys?: { [named: string]: string }
}

export function getRouteRegex(normalizedRoute: string): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute)
  if ('routeKeys' in result) {
    return {
      re: new RegExp(`^${result.parameterizedRoute}(?:/)?$`),
      groups: result.groups,
      routeKeys: result.routeKeys,
      namedRegex: `^${result.namedParameterizedRoute}(?:/)?$`,
    }
  }

  return {
    re: new RegExp(`^${result.parameterizedRoute}(?:/)?$`),
    groups: result.groups,
  }
}

export function getMiddlewareRegex(
  normalizedRoute: string,
  catchAll: boolean = true
): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute)

  let catchAllRegex = catchAll ? '(?!_next).*' : ''
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''

  if ('routeKeys' in result) {
    if (result.parameterizedRoute === '/') {
      return {
        groups: {},
        namedRegex: `^/${catchAllRegex}$`,
        re: new RegExp(`^/${catchAllRegex}$`),
        routeKeys: {},
      }
    }

    return {
      groups: result.groups,
      namedRegex: `^${result.namedParameterizedRoute}${catchAllGroupedRegex}$`,
      re: new RegExp(`^${result.parameterizedRoute}${catchAllGroupedRegex}$`),
      routeKeys: result.routeKeys,
    }
  }

  if (result.parameterizedRoute === '/') {
    return {
      groups: {},
      re: new RegExp(`^/${catchAllRegex}$`),
    }
  }

  return {
    groups: {},
    re: new RegExp(`^${result.parameterizedRoute}${catchAllGroupedRegex}$`),
  }
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
