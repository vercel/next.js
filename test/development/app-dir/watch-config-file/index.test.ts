import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import { join } from 'path'

describe('app-dir watch-config-file', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixture'),
  })

  it('should output config file change and restart server for app router', async () => {
    await check(async () => next.cliOutput, /ready/i)

    await check(async () => {
      await next.patchFile(
        'next.config.js',
        `
            console.log(${Date.now()})
            const nextConfig = {
              reactStrictMode: true,
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
      return next.cliOutput
    }, /Found a change in next\.config\.js\. Restarting the server to apply the changes\.\.\./)

    await check(() => next.fetch('/about').then((res) => res.status), 200)
  })

  it('should show accurate Ready in duration after restart', async () => {
    // No shared parser for "Ready in", handle all units
    const toMs = (m: RegExpMatchArray) => {
      const v = parseFloat(m[1])
      const u = m[2]
      return u === 'min' ? v * 60_000 : u === 's' ? v * 1000 : v
    }

    await retry(async () => {
      expect(next.cliOutput).toMatch(/✓ Ready in /)
    })

    const initialMatch = next.cliOutput.match(
      /✓ Ready in (\d+(?:\.\d+)?)(ms|s|min)/
    )
    expect(initialMatch).not.toBeNull()

    const outputBeforeRestart = next.cliOutput.length

    // Trigger restart, retried because the file watcher may need multiple writes
    await check(async () => {
      await next.patchFile(
        'next.config.js',
        `
            const nextConfig = {
              poweredByHeader: false,
            }
            module.exports = nextConfig`
      )
      return next.cliOutput
    }, /Found a change in next\.config\.js\. Restarting the server to apply the changes\.\.\./)

    // Restart duration should be comparable to initial startup
    await retry(
      async () => {
        const postRestartOutput = next.cliOutput.slice(outputBeforeRestart)
        const restartMatch = postRestartOutput.match(
          /✓ Ready in (\d+(?:\.\d+)?)(ms|s|min)/
        )
        expect(restartMatch).not.toBeNull()

        const restartMs = toMs(restartMatch!)
        // The restart should complete in well under 2 minutes.
        // Before the fix, this would show the total process uptime (e.g., 84 min).
        expect(restartMs).toBeLessThan(120_000)
      },
      30_000,
      1000
    )
  })
})
