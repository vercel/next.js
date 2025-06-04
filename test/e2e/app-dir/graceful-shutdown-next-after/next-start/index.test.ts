import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('after during server shutdown - next start', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true, // the tests use cli logs
    skipStart: true,
  })
  if (skipped) {
    return
  }

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    // if the test didn't manage to kill next, we should do it ourselves
    await next.stop()
  }, 10_000)

  if (isNextDev) {
    // `next dev` shuts down the child process that runs the server without waiting for cleanups,
    // so `after` callbacks won't have the chance to complete
    it.each(['SIGINT', 'SIGTERM'] as const)(
      'does not wait for after callbacks when the server receives %s',
      async (signal) => {
        await next.render('/')
        await retry(async () => {
          expect(next.cliOutput).toInclude('[after] starting sleep')
        })
        await next.stop(signal)
        expect(next.cliOutput).not.toInclude('[after] finished sleep')
      }
    )
  }

  if (!isNextDev) {
    it.each(['SIGINT', 'SIGTERM'] as const)(
      'waits for after callbacks when the server receives %s',
      async (signal) => {
        await next.render('/')
        await retry(async () => {
          expect(next.cliOutput).toInclude('[after] starting sleep')
        })
        await next.stop(signal)
        expect(next.cliOutput).toInclude('[after] finished sleep')
      }
    )
  }
})
