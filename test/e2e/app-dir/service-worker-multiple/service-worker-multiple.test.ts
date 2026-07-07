import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - service worker (multiple registrations error)', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    // Compiling `navigator.serviceWorker.register(new URL(...))` is a
    // Turbopack-only feature.
    it('skips on webpack', () => {})
    return
  }

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
