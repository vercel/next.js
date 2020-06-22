// this isn't importing the escape-string-regex module
// to reduce bytes
function escapeRegex(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}

function parseParameter(param: string) {
  const optional = /^\\\[.*\\\]$/.test(param)
  if (optional) {
    param = param.slice(2, -2)
  }
  const repeat = /^(\\\.){3}/.test(param)
  if (repeat) {
    param = param.slice(6)
  }
  // Un-escape key
  const key = param.replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
  return { key, repeat, optional }
}

export function getRouteRegex(
  normalizedRoute: string
): {
  re: RegExp
  namedRegex?: string
  routeKeys?: { [named: string]: string }
  groups: {
    [groupName: string]: { pos: number; repeat: boolean; optional: boolean }
  }
} {
  // Escape all characters that could be considered RegEx
  const escapedRoute = escapeRegex(normalizedRoute.replace(/\/$/, '') || '/')

  const groups: {
    [groupName: string]: { pos: number; repeat: boolean; optional: boolean }
  } = {}
  let groupIndex = 1

  const parameterizedRoute = escapedRoute.replace(
    /\/\\\[([^/]+?)\\\](?=\/|$)/g,
    (_, $1) => {
      const { key, optional, repeat } = parseParameter($1)
      groups[key] = { pos: groupIndex++, repeat, optional }
      return repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
    }
  )

  let namedParameterizedRoute: string | undefined

  // dead code eliminate for browser since it's only needed
  // while generating routes-manifest
  if (typeof window === 'undefined') {
    const routeKeys: { [named: string]: string } = {}

    namedParameterizedRoute = escapedRoute.replace(
      /\/\\\[([^/]+?)\\\](?=\/|$)/g,
      (_, $1) => {
        const { key, repeat } = parseParameter($1)
        // replace any non-word characters since they can break
        // the named regex
        const cleanedKey = key.replace(/\W/g, '')
        routeKeys[cleanedKey] = key
        return repeat ? `/(?<${cleanedKey}>.+?)` : `/(?<${cleanedKey}>[^/]+?)`
      }
    )

    return {
      re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
      groups,
      routeKeys,
      namedRegex: `^${namedParameterizedRoute}(?:/)?$`,
    }
  }

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}
