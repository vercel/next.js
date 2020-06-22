// this isn't importing the escape-string-regex module
// to reduce bytes
function escapeRegex(str: string) {
  return str.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
}

function parseParameter(param: string) {
  let key = param
  const optional = key.startsWith('[') && key.endsWith(']')
  if (optional) {
    key = key.slice(1, -1)
  }
  const repeat = key.startsWith('...')
  if (repeat) {
    key = key.slice(3)
  }
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
  const segments = (normalizedRoute.replace(/\/$/, '') || '/')
    .split('/')
    .slice(1)

  const groups: {
    [groupName: string]: { pos: number; repeat: boolean; optional: boolean }
  } = {}
  let groupIndex = 1

  const parameterizedRoute = segments
    .map((seg) => {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const { key, optional, repeat } = parseParameter(seg.slice(1, -1))
        groups[key] = { pos: groupIndex++, repeat, optional }
        return repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
      } else {
        return `/${escapeRegex(seg)}`
      }
    })
    .join('')

  // dead code eliminate for browser since it's only needed
  // while generating routes-manifest
  if (typeof window === 'undefined') {
    const routeKeys: { [named: string]: string } = {}

    const namedParameterizedRoute = segments
      .map((seg) => {
        if (seg.startsWith('[') && seg.endsWith(']')) {
          const { key, optional, repeat } = parseParameter(seg.slice(1, -1))
          // replace any non-word characters since they can break
          // the named regex
          const cleanedKey = key.replace(/\W/g, '')
          routeKeys[cleanedKey] = key
          return repeat
            ? optional
              ? `(?:/(?<${cleanedKey}>.+?))?`
              : `/(?<${cleanedKey}>.+?)`
            : `/(?<${cleanedKey}>[^/]+?)`
        } else {
          return `/${escapeRegex(seg)}`
        }
      })
      .join('')

    return {
      re: new RegExp(`^${parameterizedRoute}(?:/)?$`, 'i'),
      groups,
      routeKeys,
      namedRegex: `^${namedParameterizedRoute}(?:/)?$`,
    }
  }

  return {
    re: new RegExp(`^${parameterizedRoute}(?:/)?$`, 'i'),
    groups,
  }
}
