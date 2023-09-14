// TODO: look at adding status page routes
const INTERNAL_PAGES = ['/_app', '/_error', '/_document', '/404', '/500']

export function isInternalPagesRoute(page: string): boolean {
  return INTERNAL_PAGES.includes(page)
}
