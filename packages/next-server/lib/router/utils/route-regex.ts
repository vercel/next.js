export function getRouteRegex(
  normalizedRoute: string
): { re: RegExp; groups: { [groupName: string]: number } } {
  const escapedRoute = (normalizedRoute.replace(/\/$/, '') || '/').replace(
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
