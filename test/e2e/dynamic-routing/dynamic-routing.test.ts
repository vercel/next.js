import { nextTestSetup, isNextDev } from 'e2e-utils'
import { runTests } from './shared'

describe('Dynamic Routing', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    // Some assertions (`should not decode slashes`, `should serve file with
    // plus from public/static folder`) depend on local Next.js URL handling
    // and don't apply to Vercel's deploy infrastructure.
    skipDeployment: true,
  })
  if (skipped) return

  runTests({ next, isNextDev, isTurbopack, middlewareEnabled: false })
})
