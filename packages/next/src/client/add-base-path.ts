import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function addBasePath(path: string, required?: boolean): string {
  return normalizePathTrailingSlash(
    process.env.__NEXT_MANUAL_CLIENT_BASE_PATH && !required
      ? path
      : addPathPrefix(path, basePath)
  )
}
