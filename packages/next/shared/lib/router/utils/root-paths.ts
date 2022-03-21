// strip `@propName` from pathname and normalize `+` to `/`
export function normalizeRootPath(pathname: string) {
  let normalized = ''

  pathname.split('/').forEach((segment) => {
    segment.split('+').forEach((subSegment) => {
      const value = subSegment.split('@').shift()
      if (value) {
        normalized += `/${value}`
      }
    })
  })
  return normalized
}
