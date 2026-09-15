import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('proxy-and-middleware-conflict', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    beforeAll(async () => {
      // The dev bundler discovers both files during its first compile,
      // logs the conflict to stderr, and surfaces it as an unhandled
      // rejection but keeps the server process alive. Starting succeeds;
      // we just need the boot-time scan to have run.
      await next.start()
    })
  } else {
    beforeAll(async () => {
      try {
        await next.build()
      } catch {
        // Expect build error.
      }
    })
  }

  it('should report that both middleware and proxy files are present', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'are detected. Please use "./proxy.page.ts" only.'
      )
    })
  })
})
