export function getRouteRegex(
  route: string,
): { re: RegExp; groups: { [groupName: string]: number } } {
  const escapedRoute = (route.replace(/\/$/, '') || '/').replace(
    /[|\\{}()[\]^$+*?.-]/g,
    '\\$&',
  )

  const groups: { [groupName: string]: number } = {}
  let groupIndex = 1

  const parameterizedRoute = escapedRoute.replace(
    /\/\\\$([^\/]+?)(?=\/|$)/g,
    (_, $1) => (
      (groups[
        $1.replace(/\\\$$/, '').replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
      ] = groupIndex++),
      $1.lastIndexOf('$') === $1.length - 1 ? '(?:/([^/]+?))?' : '/([^/]+?)'
    ),
  )

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}
