import { nextTestSetup } from 'e2e-utils'

describe('node-cli-args', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `node --experimental-network-inspection ./node_modules/next/dist/bin/next ${process.env.NEXT_TEST_MODE === 'dev' ? 'dev' : 'start'}`,
    skipDeployment: true,
    skipStart: true,
  })

  it('should start server with --experimental-network-inspection', async () => {
    if (
      !process.allowedNodeEnvironmentFlags.has(
        '--experimental-network-inspection'
      )
    ) {
      await expect(next.start()).rejects.toThrow()
    } else {
      await next.start()
    }
  })
})
