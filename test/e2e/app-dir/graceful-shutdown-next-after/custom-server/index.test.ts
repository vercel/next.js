import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('unstable_after during server shutdown - custom server', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.mjs',
    serverReadyPattern: /Custom server started/,
    skipStart: true,
    skipDeployment: true, // the tests use cli logs and a custom server
    env: {
      NODE_ENV: isNextDev ? 'development' : 'production',
      DEBUG: '1',
    },
  })

  beforeEach(async () => {
    console.log('--------- starting... ---------')
    await next.start()
    console.log('--------- started!    ---------')
  })

  afterEach(async () => {
    console.log('--------- stopping... ---------')
    // if the test didn't manage to kill next, we should do it ourselves
    await next.stop()
    console.log('--------- stopped!    ---------')
  }, 10_000)

  // unlike the above test for `next dev`, NextCustomServer has no logic that'd cause it to skip cleanups in dev mode,
  // so this is the same in both modes
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
})
