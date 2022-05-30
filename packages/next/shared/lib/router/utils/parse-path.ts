/**
 * Given a path this function will find the pathname, query and hash and return
 * them. This is useful to parse full paths on the client side.
 * @param path A path to parse e.g. /foo/bar?id=1#hash
 */
export function parsePath(path: string) {
  const hashIndex = path.indexOf('#')
  const queryIndex = path.indexOf('?')

  if (queryIndex > -1 || hashIndex > -1) {
    return {
      pathname: path.substring(0, queryIndex > -1 ? queryIndex : hashIndex),
      query:
        queryIndex > -1
          ? path.substring(queryIndex, hashIndex > -1 ? hashIndex : undefined)
          : '',
      hash: hashIndex > -1 ? path.slice(hashIndex) : '',
    }
  }

  return { pathname: path, query: '', hash: '' }
}
