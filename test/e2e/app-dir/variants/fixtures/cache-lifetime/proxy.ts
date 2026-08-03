import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import * as variants from './variants'

// The variants transform will synthesize this for a project that has no proxy
// of its own. Wired by hand until then.
export const proxy = wrapProxy(variants)

export const config = {
  matcher: ['/lifetime/:slug'],
}
