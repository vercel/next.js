export function getRouteRegex(
  normalizedRoute: string
): { re: RegExp; groups: { [groupName: string]: number } } {
  // Escape all characters that could be considered RegEx
  const escapedRoute = (normalizedRoute.replace(/\/$/, '') || '/').replace(
    /[|\\{}()[\]^$+*?.-]/g,
    '\\$&'
  )

  const groups: { [groupName: string]: number } = {}
  let groupIndex = 1

  const parameterizedRoute = escapedRoute.replace(
    /\/([^\/]*?)\\\[([^\/]+?)\\\](?=\/|$)/g,
    (_, $1, $2) => (
      (groups[
        $2
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$2')
      ] = groupIndex++),
      `/${$1.replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')}([^/]+?)`
    )
  )

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}
