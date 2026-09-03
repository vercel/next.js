import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

// The variants transform will wrap the proxy automatically, synthesize one when
// the project has none, and derive each route's variants from its module graph,
// layouts included. Wired by hand until then.
export const proxy = wrapProxy({ '/lifetime/[slug]': [theme] })

export const config = {
  matcher: ['/lifetime/:slug'],
}
