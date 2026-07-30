import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'
import { retry } from 'next-test-utils'

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
          await next.fetch('/404')

          // Wait for after 404 is rendered to the console.
          await retry(async () => {
            expect(next.cliOutput).toContain('GET /404 404')
          })

          const from = next.cliOutput.length

          await next.browser('/')

          // trim off any logs after the HTTP request finished
          const output = next.cliOutput.slice(from)
          expect(output).toContain('GET / 200')
          const snapshot = output.slice(0, output.indexOf('GET / 200')).trim()

          expect(snapshot).toMatchInlineSnapshot(
            `"[<timestamp>] This is a console log from a server component page"`
          )
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
             [<timestamp>]   Collecting build traces ...
             [<timestamp>]"
            `)
          }
        })
      }
    })
  })
})
