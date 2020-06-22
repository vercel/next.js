interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

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
  groups: { [groupName: string]: Group }
} {
  const segments = (normalizedRoute.replace(/\/$/, '') || '/')
    .slice(1)
    .split('/')

  const groups: { [groupName: string]: Group } = {}
  let groupIndex = 1
  let parameterizedRoute = ''

  for (const segment of segments) {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const { key, optional, repeat } = parseParameter(segment.slice(1, -1))
      groups[key] = { pos: groupIndex++, repeat, optional }
      parameterizedRoute += repeat
        ? optional
          ? '(?:/(.+?))?'
          : '/(.+?)'
        : '/([^/]+?)'
    } else {
      parameterizedRoute += `/${escapeRegex(segment)}`
    }
  }

  // dead code eliminate for browser since it's only needed
  // while generating routes-manifest
  if (typeof window === 'undefined') {
    const routeKeys: { [named: string]: string } = {}

    let namedParameterizedRoute = ''
    for (const segment of segments) {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const { key, optional, repeat } = parseParameter(segment.slice(1, -1))
        // replace any non-word characters since they can break
        // the named regex
        const cleanedKey = key.replace(/\W/g, '')
        routeKeys[cleanedKey] = key
        namedParameterizedRoute += repeat
          ? optional
            ? `(?:/(?<${cleanedKey}>.+?))?`
            : `/(?<${cleanedKey}>.+?)`
          : `/(?<${cleanedKey}>[^/]+?)`
      } else {
        namedParameterizedRoute += `/${escapeRegex(segment)}`
      }
    }

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
