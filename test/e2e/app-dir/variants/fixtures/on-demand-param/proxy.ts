import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

// The variants transform will wrap the proxy automatically and derive each
// route's variants from its module graph. Wired by hand until then.
//
// `/control/[slug]` is deliberately absent, so that nothing resolves a variant
// for it and it keeps the shape of a route in a project without variants.
const variantsByRoute = {
  '/declared/[slug]': [theme],
}

export const proxy = wrapProxy(variantsByRoute, () => undefined)

export const config = {
  matcher: ['/declared/:slug'],
}
