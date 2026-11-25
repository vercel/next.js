import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a Turbopack-only feature.
// This test asserts a build failure from the CLI output. In deploy mode,
// `next.start()` is a full Vercel deployment, which exceeds the default test
// timeout before the build failure is observed.
// @force-gate turbopack
// @force-gate !deploy
describe('app dir - service worker (multiple registrations error)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This test asserts a build failure.
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
