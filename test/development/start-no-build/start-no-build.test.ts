import { nextTestSetup } from 'e2e-utils'

describe('next start without next build', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startCommand: `pnpm next start`,
  })

  // This test only makes sense in production mode - skip in dev mode
  // The test also fails on canary in dev mode (pre-existing issue)
  if (isNextDev || skipped) {
    it('skip test in development mode', () => {})
    return
  }

  it('should show error when there is no production build', async () => {
    // Set up stderr listener before starting to capture the error
    let errorFound = false
    next.on('stderr', (msg: string) => {
      if (msg.includes('Could not find a production build in the')) {
        errorFound = true
      }
    })

    // start() will throw because the server exits with error code
    try {
      await next.start()
    } catch (e) {
      // Expected - server should fail to start without a build
    }

    expect(errorFound).toBe(true)
  })
})
