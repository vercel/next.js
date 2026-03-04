import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('ready-in-restart-accuracy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show accurate startup duration after config-triggered restart', async () => {
    // Wait for the initial "Ready in" message
    await retry(async () => {
      expect(next.cliOutput).toMatch(/✓ Ready in /)
    })

    // Record the output length so we can isolate post-restart output
    const outputLengthBeforeRestart = next.cliOutput.length

    // Trigger a restart by modifying next.config.js.
    // Wrap in retry because the file watcher may need time to start
    // watching and the built-in restart detection has a short timeout.
    await retry(async () => {
      await next.patchFile(
        'next.config.js',
        `
/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/about',
        destination: '/',
        permanent: false,
      },
    ]
  },
}
module.exports = nextConfig`
      )
    }, 30_000)

    const postRestartOutput = next.cliOutput.slice(outputLengthBeforeRestart)

    // Verify the restart happened
    expect(postRestartOutput).toContain(
      'Found a change in next.config.js. Restarting the server to apply the changes...'
    )

    // Extract the "Ready in" duration after restart
    const readyInMatch = postRestartOutput.match(
      /✓ Ready in (\d+(?:\.\d+)?)(ms|s|min)/
    )
    expect(readyInMatch).not.toBeNull()

    const value = parseFloat(readyInMatch![1])
    const unit = readyInMatch![2]

    // Convert to milliseconds for a uniform comparison
    let durationMs: number
    switch (unit) {
      case 'ms':
        durationMs = value
        break
      case 's':
        durationMs = value * 1000
        break
      case 'min':
        durationMs = value * 60 * 1000
        break
      default:
        throw new Error(`Unexpected unit: ${unit}`)
    }

    // The restart should complete in well under 2 minutes.
    // Before the fix, this would show the total process uptime (e.g., 84 minutes).
    expect(durationMs).toBeLessThan(120_000)
  })
})
