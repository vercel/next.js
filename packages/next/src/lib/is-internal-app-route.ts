const INTERNAL_APP_PAGES = ['/_not-found', '/not-found']

export function isInternalAppRoute(page: string): boolean {
  return INTERNAL_APP_PAGES.includes(page)
}
