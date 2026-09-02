import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a Turbopack-only feature.
// Deploy mode exclusion: This suite intentionally exercises a failed local build, so it cannot produce a deployment.
// This test asserts a build failure.
// @force-gate !deploy
// @force-gate turbopack
describe('app dir - service worker (multiple registrations error)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('errors when different service worker files are registered', async () => {
    // In production `next.start()` runs the build, which fails. In dev the server
    // boots and the failure surfaces when the registering page is compiled.
    await next.start().catch(() => {})
    if (isNextDev) {
      await next.fetch('/').catch(() => {})
    }

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'Multiple service workers with different source files'
      )
    })
  })
})
