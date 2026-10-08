/* eslint-disable jest/no-standalone-expect */
import path from 'path'
import { isNextStart, nextTestSetup } from 'e2e-utils'

// Turbopack runs PostCSS in a Node.js side process that talks to the Rust
// process over a local TCP socket. When connecting to that local port is
// denied (e.g. a sandbox without a usable loopback interface), the side
// process exits silently with status 0 and the build fails with an internal
// compiler error instead of an actionable diagnostic.
//
// This test documents the current (broken) output. When the diagnostic is
// improved, the assertions below have to be updated.
;(process.env.IS_TURBOPACK_TEST && isNextStart ? describe : describe.skip)(
  'turbopack css node process connect failure',
  () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixture'),
      skipStart: true,
      skipDeployment: true,
    })

    it('fails the build with an internal error when the CSS side process cannot use a local port', async () => {
      const { exitCode, cliOutput } = await next.build({
        env: {
          NODE_OPTIONS: `--require "${path.join(
            next.testDir,
            'deny-local-port-connect.js'
          )}"`,
        },
      })

      expect(exitCode).toBe(1)

      // The failure happens while processing CSS with PostCSS.
      expect(cliOutput).toContain('app/globals.css')
      expect(cliOutput).toContain(
        'Execution of PostCssTransformedAsset::process failed'
      )

      // Current behavior: an internal Turbopack error that neither mentions
      // the denied local port nor tells the user what to do about it, and
      // that asks the user to report a Turbopack bug.
      expect(cliOutput).toContain('TurbopackInternalError')
      expect(cliOutput).toContain(
        'node process exited before we could connect to it with exit status: 0'
      )
      expect(cliOutput).toContain(
        'report this error by clicking here: https://bugs.nextjs.org/'
      )
    })
  }
)
