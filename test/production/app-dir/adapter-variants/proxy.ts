import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { locale, theme } from './variants'

// The variants transform will wrap the proxy automatically and derive each
// route's variants from its module graph. Wired by hand until then.
const variantsByRoute = {
  '/concrete': [locale, theme],
  '/dynamic/[slug]': [locale, theme],
}

export const proxy = wrapProxy(variantsByRoute, () => undefined)

export const config = {
  matcher: ['/concrete', '/dynamic/:slug'],
}
