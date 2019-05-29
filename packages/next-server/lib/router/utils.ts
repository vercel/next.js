export function getRouteRegex(
  route: string
): { re: RegExp; groups: { [groupName: string]: number } } {
  const escapedRoute = (route.replace(/\/$/, '') || '/').replace(
    /[|\\{}()[\]^$+*?.-]/g,
    '\\$&'
  )

  const groups: { [groupName: string]: number } = {}
  let groupIndex = 1

  const parameterizedRoute = escapedRoute.replace(
    /\/\\\$([^\/]+?)(?=\/|$)/g,
    (_, $1) => (
      (groups[
        $1
          // // Remove optional parameter marker
          // .replace(/\\\$$/, '')
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
      ] = groupIndex++),
      // // Test the route for an optional parameter
      // $1.lastIndexOf('$') === $1.length - 1
      //   ? // Optional: match a param
      //     '(?:/([^/]+?))?'
      //   : // Required: match a param
      '/([^/]+?)'
    )
  )

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}

export function getRouteMatch(route: string) {
  const { re, groups } = getRouteRegex(route)
  return (pathname: string | undefined) => {
    const routeMatch = re.exec(pathname!)
    if (!routeMatch) {
      return false
    }

    const params: { [paramName: string]: string } = {}

    Object.keys(groups).forEach((slugName: string) => {
      const m = routeMatch[groups[slugName]]
      if (m !== undefined) {
        params[slugName] = decodeURIComponent(m)
      }
    })
    return params
  }
}
