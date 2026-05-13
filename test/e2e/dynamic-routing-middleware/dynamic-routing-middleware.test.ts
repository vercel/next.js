import { nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'
import { runTests } from '../dynamic-routing/shared'

describe('Dynamic Routing with Middleware', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: join(__dirname, '../dynamic-routing'),
    skipStart: true,
    disableAutoSkewProtection: true,
    skipDeployment: true,
  })
  if (skipped) return

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
