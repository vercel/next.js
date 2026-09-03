import { type NextRequest } from 'next/server'
import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

// The variants transform will wrap the proxy automatically and derive each
// route's variants from its module graph. Wired by hand until then.
const variantsByRoute = {
  '/above-boundary': [theme],
}

export const proxy = wrapProxy(variantsByRoute, (_request: NextRequest) => {
  return undefined
})

export const config = {
  matcher: ['/above-boundary'],
}
