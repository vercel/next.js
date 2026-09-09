import { nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'
import { runTests } from '../dynamic-routing/shared'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
describe('Dynamic Routing with Middleware', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, '../dynamic-routing'),
    skipStart: true,
    disableAutoSkewProtection: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'middleware.js',
      `
import { NextResponse } from 'next/server'
export default function middleware() {
  return NextResponse.next()
}
`
    )
    await next.start()
  })

  runTests({ next, isNextDev, isTurbopack, middlewareEnabled: true })
})
