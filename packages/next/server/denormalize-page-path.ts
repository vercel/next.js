import { isDynamicRoute } from '../shared/lib/router/utils'

export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}

export function denormalizePagePath(page: string) {
  page = normalizePathSep(page)
  if (page.startsWith('/index/') && !isDynamicRoute(page)) {
    page = page.slice(6)
  } else if (page === '/index') {
    page = '/'
  }
  return page
}
