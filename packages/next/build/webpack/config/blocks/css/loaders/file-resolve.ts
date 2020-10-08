import { resolveRequest } from '../../../../../../lib/resolve-request'

export function cssFileResolve(url: string, resourcePath: string) {
  let res: string | undefined

  // let css-loader resolve from node_modules
  if (url.startsWith('~')) {
    return true
  }

  // make url relative if not
  if (!url.startsWith('/') && !url.startsWith('.') && !url.startsWith('\\')) {
    url = `./${url}`
  }

  try {
    res = resolveRequest(url, resourcePath)
  } catch (err) {
    // If the request cannot be resolved, tell css-loader to not
    // attempt resolving since it will fail the build.
    return false
  }

  // if we resolved correctly let css-loader handle it
  // otherwise pass it through since it could be a URL
  // pointing to the public directory
  return !!res
}
