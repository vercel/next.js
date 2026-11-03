import { nextTestSetup } from 'e2e-utils'

// This tests Node's handling of a CLI flag in the local startCommand. Deploy mode
// uses Vercel's managed runtime and does not execute that Node invocation.
// @force-gate !deploy
describe('node-cli-args', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `node --experimental-network-inspection ./node_modules/next/dist/bin/next ${process.env.NEXT_TEST_MODE === 'dev' ? 'dev' : 'start'}`,
    skipStart: true,
  })

  // The happy path was never exercised while CI ran Node.js 20 (the flag
  // doesn't exist there). On Node.js 22+ the inspector wraps undici in a way
  // that bypasses Next.js's fetch instrumentation, so prerendering the
  // fixture's uncached fetch fails with "uncached or runtime data during
  // prerendering".
  it.failing(
    'should start server with --experimental-network-inspection',
    async () => {
      await next.start()
    }
  )
})
