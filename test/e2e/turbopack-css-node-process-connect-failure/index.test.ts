import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Turbopack runs PostCSS in a Node.js side process that talks to the Rust
// process over a local TCP socket. When connecting to that local port is
// denied (e.g. a sandbox without a usable loopback interface), the build should
// fail with an actionable diagnostic rather than an internal compiler error.
// @force-gate turbopack
describe('turbopack css node process connect failure', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    skipStart: true,
    skipDeployment: true,
  })

  it('reports an actionable error when the CSS side process cannot use a local port', async () => {
    const env = {
      NODE_OPTIONS: `--require "${path.join(
        next.testDir,
        'deny-local-port-connect.js'
      )}"`,
    }

    let cliOutput: string
    if (isNextDev) {
      await next.start({ env })
      // Compiling the page runs PostCSS on its global CSS.
      await next.fetch('/')
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'Node.js worker processes could not connect to Turbopack'
        )
      })
      cliOutput = next.cliOutput
    } else {
      const result = await next.build({ env })
      expect(result.exitCode).toBe(1)
      cliOutput = result.cliOutput
    }

    expect(cliOutput).toContain(
      'Node.js worker processes could not connect to Turbopack'
    )
    // The issue is attributed to the file being transformed, and says which
    // transform was running.
    expect(cliOutput).toContain('./app/globals.css')
    expect(cliOutput).toContain('while evaluating loaders [postcss]')
    // The underlying reason reported by the child process.
    expect(cliOutput).toContain('connect ENETUNREACH 127.0.0.1')
    // The suggested workaround.
    expect(cliOutput).toContain(
      "experimental.turbopackPluginRuntimeStrategy: 'workerThreads'"
    )
    expect(cliOutput).toContain(
      'https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackPluginRuntimeStrategy'
    )

    // This is not a Turbopack bug, so don't present it as one.
    expect(cliOutput).not.toContain('TurbopackInternalError')
    expect(cliOutput).not.toContain('https://bugs.nextjs.org/')
    // Lines of the message must not be mistaken for stack frames.
    expect(cliOutput).not.toContain('at <unknown>')
  })
})
