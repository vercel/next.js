import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { getRuntimeBasePath } from '../shared/lib/router/utils/runtime-base-path'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

const compileTimeBasePath =
  (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function addBasePath(path: string, required?: boolean): string {
  const basePath = process.env.__NEXT_RUNTIME_BASE_PATH_ENABLED
    ? getRuntimeBasePath()
    : compileTimeBasePath
  return normalizePathTrailingSlash(
    process.env.__NEXT_MANUAL_CLIENT_BASE_PATH && !required
      ? path
      : addPathPrefix(path, basePath)
  )
}
