/**
 * Given a path this function will find the pathname, query and hash and return
 * them. This is useful to parse full paths on the client side.
 * @param path A path to parse e.g. /foo/bar?id=1#hash
 */
export function parsePath(path: string) {
  const hashIndex = path.indexOf('#')
  const queryIndex = path.indexOf('?')
  const hasQuery = queryIndex > -1 && (hashIndex < 0 || queryIndex < hashIndex)

  if (hasQuery || hashIndex > -1) {
    return {
      pathname: path.substring(0, hasQuery ? queryIndex : hashIndex),
      query: hasQuery
        ? path.substring(queryIndex, hashIndex > -1 ? hashIndex : undefined)
        : '',
      hash: hashIndex > -1 ? path.slice(hashIndex) : '',
    }
  }

  return { pathname: path, query: '', hash: '' }
}
