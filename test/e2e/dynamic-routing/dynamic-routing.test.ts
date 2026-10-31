import { nextTestSetup, isNextDev } from 'e2e-utils'
import { runTests } from './shared'

// Deploy mode exclusion: The assertions exercise behavior specific to the local Next.js server.
// Some assertions (`should not decode slashes`, `should serve file with
// plus from public/static folder`) depend on local Next.js URL handling
// and don't apply to Vercel's deploy infrastructure.
// @force-gate !deploy
describe('Dynamic Routing', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
  })

  runTests({ next, isNextDev, isTurbopack, middlewareEnabled: false })
})
