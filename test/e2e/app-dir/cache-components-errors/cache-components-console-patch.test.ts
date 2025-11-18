import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import stripAnsi from 'strip-ansi'

describe('Cache Components Errors', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/console-patch',
    skipDeployment: true,
    skipStart: !isNextDev,
    env: {
      NODE_OPTIONS: '--require ./patch-console.js',
    },
  })

  if (skipped) {
    return
  }

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })

  describe('Sync IO in console methods', () => {
    describe('Console Patching', () => {
      if (isNextDev) {
        it('does not warn about sync IO if console.log is patched to call new Date() internally', async () => {
          await next.browser('/')
          let output = stripAnsi(next.cliOutput)

          // trim off Next.js's startup logs
          const compilationMarker = /Ready in.*(\n.*Compiling.*)?/
          expect(output).toMatch(compilationMarker)
          const match = compilationMarker.exec(output)
          output = output.slice(match.index + match[0].length).trim()

          // trim off any logs after the HTTP request finished
          expect(output).toContain('GET / 200')
          const snapshot = output.slice(0, output.indexOf('GET / 200')).trim()

          expect(snapshot).toMatchInlineSnapshot(`
           "[<timestamp>] This is a console log from a server component page
           [<timestamp>] This is a console log from a server component page
           [<timestamp>] This is a console log from a server component page"
          `)
        })
      } else {
        it('does not fail the build for Sync IO if console.log is patched to call new Date() internally', async () => {
          try {
            await next.build()
          } catch {}

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: true }
          )

          if (isTurbopack) {
            expect(output).toMatchInlineSnapshot(`
             "[<timestamp>] This is a console log from a server component page
             [<timestamp>] This is a console log from a server component page
             [<timestamp>]"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
                        "[<timestamp>] This is a console log from a server component page
                        [<timestamp>] This is a console log from a server component page
                        [<timestamp>]    Collecting build traces ...
                        [<timestamp>]"
                      `)
          }
        })
      }
    })
  })
})
