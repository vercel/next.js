import type { ParsedUrlQuery } from 'querystring'

import { getRouteMatcher } from './route-matcher'
import { getRouteRegex } from './route-regex'

export function interpolateAs(
  route: string,
  asPathname: string,
  query: ParsedUrlQuery
) {
  let interpolatedRoute = ''

  const dynamicRegex = getRouteRegex(route)
  const dynamicGroups = dynamicRegex.groups
  const dynamicMatches =
    // Try to match the dynamic route against the asPath
    (asPathname !== route ? getRouteMatcher(dynamicRegex)(asPathname) : '') ||
    // Fall back to reading the values from the href
    // TODO: should this take priority; also need to change in the router.
    query

  interpolatedRoute = route
  const params = Object.keys(dynamicGroups)

  if (
    !params.every((param) => {
      let value = dynamicMatches[param] || ''
      const { repeat, optional } = dynamicGroups[param]

      // support single-level catch-all
      // TODO: more robust handling for user-error (passing `/`)
      let replaced = `[${repeat ? '...' : ''}${param}]`
      if (optional) {
        replaced = `${!value ? '/' : ''}[${replaced}]`
      }
      if (repeat && !Array.isArray(value)) value = [value]

      return (
        (optional || param in dynamicMatches) &&
        // Interpolate group into data URL if present
        (interpolatedRoute =
          interpolatedRoute!.replace(
            replaced,
            repeat
              ? (value as string[])
                  .map(
                    // these values should be fully encoded instead of just
                    // path delimiter escaped since they are being inserted
                    // into the URL and we expect URL encoded segments
                    // when parsing dynamic route params
                    (segment) => encodeURIComponent(segment)
                  )
                  .join('/')
              : encodeURIComponent(value as string)
          ) || '/')
      )
    })
  ) {
    interpolatedRoute = '' // did not satisfy all requirements

    // n.b. We ignore this error because we handle warning for this case in
    // development in the `<Link>` component directly.
  }
  return {
    params,
    result: interpolatedRoute,
  }
}
