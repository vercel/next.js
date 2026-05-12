import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'
import { getRuntimeBasePath } from '../shared/lib/router/utils/runtime-base-path'

const compileTimeBasePath =
  (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function hasBasePath(path: string): boolean {
  const basePath = process.env.__NEXT_RUNTIME_BASE_PATH_ENABLED
    ? getRuntimeBasePath()
    : compileTimeBasePath
  return pathHasPrefix(path, basePath)
}
