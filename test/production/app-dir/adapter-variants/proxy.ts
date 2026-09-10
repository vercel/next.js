import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { locale, theme } from './variants'

// The variants transform will wrap the proxy and derive this table from each
// route's module graph. The fixture supplies it until that transform exists.
const variantsByRoute = {
  '/concrete': [locale, theme],
  '/dynamic/[slug]': [locale, theme],
}

export const proxy = wrapProxy(variantsByRoute, () => undefined)

export const config = {
  matcher: ['/concrete', '/dynamic/:slug'],
}
