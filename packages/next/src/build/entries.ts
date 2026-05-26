import { isAPIRoute } from '../lib/is-api-route'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { PAGE_TYPES } from '../lib/page-types'
import type { ServerRuntime } from '../types'
import {
  isInstrumentationHookFile,
  isMiddlewareFile,
  isProxyFile,
} from './utils'

export function isDeferredEntry(
  page: string,
  deferredEntries: string[] | undefined
): boolean {
  if (!deferredEntries || deferredEntries.length === 0) {
    return false
  }

  const normalizedPage = page.startsWith('/') ? page : `/${page}`

  for (const pattern of deferredEntries) {
    const normalizedPattern = pattern.startsWith('/') ? pattern : `/${pattern}`

    if (normalizedPage === normalizedPattern) {
      return true
    }

    if (normalizedPage.startsWith(normalizedPattern + '/')) {
      return true
    }
  }

  return false
}

export function runDependingOnPageType<T>(params: {
  onClient: () => T
  onEdgeServer: () => T
  onServer: () => T
  page: string
  pageRuntime: ServerRuntime
  pageType?: PAGE_TYPES
}): void {
  if (
    params.pageType === PAGE_TYPES.ROOT &&
    isInstrumentationHookFile(params.page)
  ) {
    params.onServer()
    params.onEdgeServer()
    return
  }

  if (isProxyFile(params.page)) {
    params.onServer()
    return
  }

  if (isMiddlewareFile(params.page)) {
    if (params.pageRuntime === 'nodejs') {
      params.onServer()
      return
    }

    params.onEdgeServer()
    return
  }

  if (isAPIRoute(params.page)) {
    if (isEdgeRuntime(params.pageRuntime)) {
      params.onEdgeServer()
      return
    }

    params.onServer()
    return
  }

  if (params.page === '/_document') {
    params.onServer()
    return
  }

  if (
    params.page === '/_app' ||
    params.page === '/_error' ||
    params.page === '/404' ||
    params.page === '/500'
  ) {
    params.onClient()
    params.onServer()
    return
  }

  if (isEdgeRuntime(params.pageRuntime)) {
    params.onClient()
    params.onEdgeServer()
    return
  }

  params.onClient()
  params.onServer()
}
