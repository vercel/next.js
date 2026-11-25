import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

// These tests send SIGINT/SIGTERM to a local Next.js process and observe whether
// after() finishes before it exits. Vercel manages the deployed process lifecycle,
// so the test runner cannot trigger and observe this shutdown sequence.
// @force-gate !deploy
describe('after during server shutdown - next start', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    // if the test didn't manage to kill next, we should do it ourselves
    await next.stop()
  }, 10_000)

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'handles after callbacks when the server receives %s',
    async (signal) => {
      await next.render('/')
      await retry(async () => {
        expect(next.cliOutput).toInclude('[after] starting sleep')
      })
      await next.stop(signal)
      if (await gate('dev')) {
        // `next dev` shuts down its server child without waiting for cleanups.
        expect(next.cliOutput).not.toInclude('[after] finished sleep')
      } else {
        expect(next.cliOutput).toInclude('[after] finished sleep')
      }
    }
  )
})
