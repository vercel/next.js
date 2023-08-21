export function denormalizeAppPagePath(page: string): string {
  // `/` is normalized to `/index`
  if (page === '/index') {
    return '/'
  }

  return page
}
