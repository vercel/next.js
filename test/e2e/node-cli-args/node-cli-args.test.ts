import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
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
