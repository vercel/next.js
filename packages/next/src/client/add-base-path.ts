import type { Page, Route } from '../shared/lib/route-types'
import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

const basePath = (process.env.__NEXT_ROUTER_BASEPATH as string) || ''

export function addBasePath(path: Page, required?: boolean): Page
export function addBasePath(path: Route, required?: boolean): Route
export function addBasePath(path: string, required?: boolean): string
export function addBasePath(path: string, required?: boolean): string {
  return normalizePathTrailingSlash(
    process.env.__NEXT_MANUAL_CLIENT_BASE_PATH && !required
      ? path
      : addPathPrefix(path, basePath)
  )
}
