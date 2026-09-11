import { nextTestSetup } from 'e2e-utils'

// This scope verifies Node.js flags and failures of the local start command.
// The deploy harness does not launch the server with that custom Node.js command.
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
    } else {
      await next.start()
    }
  })
})
