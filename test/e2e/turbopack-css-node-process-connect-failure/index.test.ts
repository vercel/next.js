import path from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'

// Turbopack runs PostCSS in a Node.js side process that talks to the Rust
// process over a local TCP socket. When connecting to that local port is
// denied (e.g. a sandbox without a usable loopback interface), the build should
// fail with an actionable diagnostic rather than an internal compiler error.
;(process.env.IS_TURBOPACK_TEST && isNextStart ? describe : describe.skip)(
  'turbopack css node process connect failure',
  () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixture'),
      skipStart: true,
      skipDeployment: true,
    })

    it('fails the build with an actionable error when the CSS side process cannot use a local port', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: {
          NODE_OPTIONS: `--require "${path.join(
            next.testDir,
            'deny-local-port-connect.js'
          )}"`,
        },
      })

      expect(exitCode).toBe(1)

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
    })
  }
)
