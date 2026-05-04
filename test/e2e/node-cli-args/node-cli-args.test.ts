import { spawnSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

// `process.allowedNodeEnvironmentFlags` only reflects flags accepted in
// NODE_OPTIONS; some CLI-only flags (like --experimental-network-inspection on
// older Node 20 releases) are accepted on the command line even when they are
// not in that set. Probe the actual node binary to know whether the start
// command will succeed.
function nodeAcceptsExperimentalNetworkInspection() {
  const result = spawnSync(
    process.execPath,
    ['--experimental-network-inspection', '-e', ''],
    { stdio: 'ignore' }
  )
  return result.status === 0
}

describe('node-cli-args', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: `node --experimental-network-inspection ./node_modules/next/dist/bin/next ${process.env.NEXT_TEST_MODE === 'dev' ? 'dev' : 'start'}`,
    skipDeployment: true,
    skipStart: true,
  })

  it('should start server with --experimental-network-inspection', async () => {
    if (nodeAcceptsExperimentalNetworkInspection()) {
      await next.start()
    } else {
      await expect(next.start()).rejects.toThrow()
    }
  })
})
