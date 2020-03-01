export function getRouteRegex(
  normalizedRoute: string
): {
  re: RegExp
  groups: { [groupName: string]: { pos: number; repeat: boolean } }
} {
  // Escape all characters that could be considered RegEx
  const escapedRoute = (normalizedRoute.replace(/\/$/, '') || '/').replace(
    /[|\\{}()[\]^$+*?.-]/g,
    '\\$&'
  )

  const groups: { [groupName: string]: { pos: number; repeat: boolean } } = {}
  let groupIndex = 1

  const parameterizedRoute = escapedRoute.replace(
    /\/\\\[([^/]+?)\\\](?=\/|$)/g,
    (_, $1) => {
      const isCatchAll = /^(\\\.){3}/.test($1)
      groups[
        $1
          // Un-escape key
          .replace(/\\([|\\{}()[\]^$+*?.-])/g, '$1')
          .replace(/^\.{3}/, '')
        // eslint-disable-next-line no-sequences
      ] = { pos: groupIndex++, repeat: isCatchAll }
      return isCatchAll ? '/(.+?)' : '/([^/]+?)'
    }
  )

  return {
    re: new RegExp('^' + parameterizedRoute + '(?:/)?$', 'i'),
    groups,
  }
}
