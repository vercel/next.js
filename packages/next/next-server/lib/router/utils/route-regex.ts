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
    /\/\\\[([^/]+?)\\\](?=\/|$)/g,
    (_, $1) => (
      (groups[
        $1
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
        // eslint-disable-next-line no-sequences
      ] = groupIndex++),
      '/([^/]+?)'
    )
  )

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}
