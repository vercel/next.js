export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}

export function denormalizePagePath(page: string) {
  page = normalizePathSep(page)
  if (page.startsWith('/index/')) {
    page = page.slice(6)
  } else if (page === '/index') {
    page = '/'
  }
  return page
}
