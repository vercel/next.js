import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

function normalizeCliOutput(output: string) {
  return stripAnsi(output)
}

describe('app-dir - server source maps edge runtime', () => {
  const { skipped, next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/edge'),
    // Deploy tests don't have access to runtime logs.
    // Manually verify that the runtime logs match.
    skipDeployment: true,
  })

  if (skipped) return

  it('logged errors have a sourcemapped stack with a codeframe', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/rsc-error-log')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          'Error: rsc-error-log'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '\nError: rsc-error-log' +
          '\n    at logError (app/rsc-error-log/page.js:2:17)' +
          '\n    at Page (app/rsc-error-log/page.js:6:3)' +
          '\n  1 | function logError() {' +
          "\n> 2 |   console.error(new Error('rsc-error-log'))" +
          '\n    |                 ^' +
          '\n  3 | }' +
          '\n  4 |' +
          '\n  5 | export default function Page() { {' +
          '\n  ' +
          '\n}'
      )
    } else {
      // Edge runtime pages are not prerendered during `next build`.
      // `next start` is not sourcemapped on purpose.
    }
  })

  it('thrown SSR errors', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/ssr-throw')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: ssr-throw')
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: ssr-throw' +
          '\n    at throwError (app/ssr-throw/page.js:4:9)' +
          '\n    at Page (app/ssr-throw/page.js:8:3)' +
          '\n  2 |' +
          '\n  3 | function throwError() {' +
          "\n> 4 |   throw new Error('ssr-throw')" +
          '\n    |         ^' +
          '\n  5 | }' +
          '\n  6 |' +
          '\n  7 | export default function Page() { {' +
          "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)
    } else {
      // Edge runtime pages are not prerendered during `next build`.
      // `next start` is not sourcemapped on purpose.
    }
  })

  it('should log the correct values on app-render error', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/rsc-throw')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toMatch(/Error: rsc-throw/)
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: rsc-throw' +
          '\n    at throwError (app/rsc-throw/page.js:2:9)' +
          '\n    at Page (app/rsc-throw/page.js:6:3)' +
          '\n  1 | function throwError() {' +
          "\n> 2 |   throw new Error('rsc-throw')" +
          '\n    |         ^' +
          '\n  3 | }' +
          '\n  4 |' +
          '\n  5 | export default function Page() { {' +
          "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)
    } else {
      // Edge runtime pages are not prerendered during `next build`.
      // `next start` is not sourcemapped on purpose.
    }
  })
})
