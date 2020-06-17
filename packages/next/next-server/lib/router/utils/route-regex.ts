// this isn't importing the escape-string-regex module
// to reduce bytes
function escapeRegex(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
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
      const isOptional = /^\\\[.*\\\]$/.test($1)
      if (isOptional) {
        $1 = $1.slice(2, -2)
      }
      const isCatchAll = /^(\\\.){3}/.test($1)
      if (isCatchAll) {
        $1 = $1.slice(6)
      }
      groups[
        $1
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
        // eslint-disable-next-line no-sequences
      ] = { pos: groupIndex++, repeat: isCatchAll, optional: isOptional }
      return isCatchAll ? (isOptional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
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
        const isCatchAll = /^(\\\.){3}/.test($1)
        const key = $1
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
          .replace(/^\.{3}/, '')

        // replace any non-word characters since they can break
        // the named regex
        const cleanedKey = key.replace(/\W/g, '')

        routeKeys[cleanedKey] = key

        return isCatchAll
          ? `/(?<${cleanedKey}>.+?)`
          : `/(?<${cleanedKey}>[^/]+?)`
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
