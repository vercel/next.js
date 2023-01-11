import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function hasBasePath(path: string): boolean {
  return pathHasPrefix(path, basePath)
}
