/* eslint-disable jest/no-standalone-expect */
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
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '\nError: Boom' +
          '\n    at logError (app/rsc-error-log/page.js:2:16)' +
          '\n    at Page (app/rsc-error-log/page.js:6:2)' +
          '\n  1 | function logError() {' +
          "\n> 2 |   console.error(new Error('Boom'))" +
          '\n    |                ^' +
          '\n  3 | }' +
          '\n  4 |' +
          '\n  5 | export default function Page() { {' +
          '\n  ' +
          '\n}'
      )
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('thrown SSR errors', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/ssr-throw')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: Boom' +
          '\n    at throwError (app/ssr-throw/page.js:4:8)' +
          '\n    at Page (app/ssr-throw/page.js:8:2)' +
          '\n  2 |' +
          '\n  3 | function throwError() {' +
          "\n> 4 |   throw new Error('Boom')" +
          '\n    |        ^' +
          '\n  5 | }' +
          '\n  6 |' +
          '\n  7 | export default function Page() { {' +
          "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('should log the correct values on app-render error', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/rsc-throw')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toMatch(/Error: Boom/)
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: Boom' +
          '\n    at throwError (app/rsc-throw/page.js:2:8)' +
          '\n    at Page (app/rsc-throw/page.js:6:2)' +
          '\n  1 | function throwError() {' +
          "\n> 2 |   throw new Error('Boom')" +
          '\n    |        ^' +
          '\n  3 | }' +
          '\n  4 |' +
          '\n  5 | export default function Page() { {' +
          "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })
})
