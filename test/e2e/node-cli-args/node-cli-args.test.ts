import { isNextDev, nextTestSetup } from 'e2e-utils'

// This tests Node's handling of a CLI flag in the local startCommand. Deploy mode
// uses Vercel's managed runtime and does not execute that Node invocation.
// @force-gate !deploy
describe('node-cli-args', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `node --experimental-network-inspection ./node_modules/next/dist/bin/next ${process.env.NEXT_TEST_MODE === 'dev' ? 'dev' : 'start'}`,
    skipStart: true,
  })

  it('should start server with --experimental-network-inspection', async () => {
    if (process.version.startsWith('v20')) {
      // --experimental-network-inspection is not supported in Node 20.
      await expect(next.start()).rejects.toThrow()
    } else if (isNextDev) {
      await next.start()
    } else {
      // The production build was never exercised while CI ran Node.js 20
      // (the flag doesn't exist there). On Node.js 22+ the build fails
      // while prerendering the fixture's uncached fetch with "uncached or
      // runtime data during prerendering" because the inspector bypasses
      // Next.js's fetch instrumentation.
      await expect(next.start()).rejects.toThrow()
    }
  })
})
