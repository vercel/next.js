// remove (name) from pathname as it's not considered for routing
export function normalizeViewPath(pathname: string) {
  let normalized = ''
  const segments = pathname.split('/')

  segments.forEach((segment, index) => {
    if (!segment) return
    if (segment.startsWith('(') && segment.endsWith(')')) {
      return
    }
    if (segment === 'page' && index === segments.length - 1) {
      return
    }
    normalized += `/${segment}`
  })
  return normalized
}
