import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import * as variants from './variants'

// The variants transform will wrap the proxy automatically, and synthesize one
// when the project has none. Wired by hand until then.
export const proxy = wrapProxy(variants)

export const config = {
  matcher: ['/'],
}
