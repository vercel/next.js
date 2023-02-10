// remove (name) from pathname as it's not considered for routing
export function normalizeAppPath(pathname: string) {
  return pathname.split('/').reduce((acc, segment, index, segments) => {
    // Empty segments are ignored.
    if (!segment) {
      return acc
    }

    if (segment.startsWith('(') && segment.endsWith(')')) {
      return acc
    }

    if (segment.startsWith('@')) {
      return acc
    }

    if (segment === 'page' && index === segments.length - 1) {
      return acc
    }

    return acc + `/${segment}`
  }, '')
}

export function normalizeRscPath(pathname: string, enabled?: boolean) {
  return enabled ? pathname.replace(/\.rsc($|\?)/, '') : pathname
}
