import { wrapProxy } from 'next/dist/server/variants/wrap-proxy'
import { theme } from './variants'

// The legacy `middleware.ts` filename is what this fixture exists for. Next.js
// compiles it for the edge runtime unless it opts out, and the variants
// manifest is not readable there, so the build rejects the pairing.
export const middleware = wrapProxy({
  '/': [theme],
})
