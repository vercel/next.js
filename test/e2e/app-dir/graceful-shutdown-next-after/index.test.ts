import { join } from 'path'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('unstable_after during server shutdown', () => {
  describe('next start', () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: join(__dirname, 'next-start'),
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
    })

    if (isNextDev) {
      it.each(['SIGINT', 'SIGTERM'] as const)(
        'does not wait for unstable_after callbacks when the server receives %s',
        async (signal) => {
          await next.browser('/')
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
        'waits for unstable_after callbacks when the server receives %s',
        async (signal) => {
          await next.browser('/')
          await retry(async () => {
            expect(next.cliOutput).toInclude('[after] starting sleep')
          })
          await next.stop(signal)
          expect(next.cliOutput).toInclude('[after] finished sleep')
        }
      )
    }
  })

  describe('custom server', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'custom-server'),
      startCommand: 'node server.mjs',
      serverReadyPattern: /Custom server started/,
      skipStart: true,
      env: {
        NODE_ENV: isNextDev ? 'development' : 'production',
        DEBUG: '1',
      },
    })

    beforeEach(async () => {
      await next.start()
    })

    afterEach(async () => {
      // if the test didn't manage to kill next, we should do it ourselves
      await next.stop()
    })

    if (isNextDev) {
      it.each(['SIGINT', 'SIGTERM'] as const)(
        'does not wait for unstable_after callbacks when the server receives %s',
        async (signal) => {
          await next.browser('/')
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
        'waits for unstable_after callbacks when the server receives %s',
        async (signal) => {
          await next.browser('/')
          await retry(async () => {
            expect(next.cliOutput).toInclude('[after] starting sleep')
          })
          await next.stop(signal)
          expect(next.cliOutput).toInclude('[after] finished sleep')
        }
      )
    }
  })
})
