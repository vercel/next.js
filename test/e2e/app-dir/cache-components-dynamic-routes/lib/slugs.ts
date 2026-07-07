export const existingSlugs = ['/', '/about', '/contact']

export const newSlugs = ['/my-new-page']

export function normalizeSlug(slug?: string[]) {
  return '/' + (slug?.join('/') ?? '')
}

export function isKnownSlug(slug: string) {
  return existingSlugs.includes(slug) || newSlugs.includes(slug)
}
