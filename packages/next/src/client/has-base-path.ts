import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function hasBasePath(path: string): boolean {
  // If there is no base path, the pathname can't have one!
  if (basePath === '') {
    return false
  }

  return pathHasPrefix(path, basePath)
}
