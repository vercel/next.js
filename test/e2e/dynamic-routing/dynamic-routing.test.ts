import { nextTestSetup, isNextDev } from 'e2e-utils'
import { runTests } from './shared'

describe('Dynamic Routing', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
  })

  runTests({ next, isNextDev, isTurbopack, middlewareEnabled: false })
})
