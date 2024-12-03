/* eslint-disable jest/no-standalone-expect */
import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

function normalizeCliOutput(output: string) {
  return stripAnsi(output)
}

describe('app-dir - server source maps edge runtime', () => {
  const { skipped, next, isNextDev, isTurbopack } = nextTestSetup({
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
        isTurbopack
          ? '\nError: Boom' +
              // TODO(veil): Should be sourcemapped
              '\n    at logError (.next'
          : '\nError: Boom' +
              '\n    at logError (app/rsc-error-log/page.js:2:16)' +
              '\n    at logError (app/rsc-error-log/page.js:6:2)' +
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
        isTurbopack
          ? '\n ⨯ Error: Boom' +
              '\n    at throwError (./app/ssr-throw/page.js:4:9)' +
              '\n    at Page (./app/ssr-throw/page.js:8:3)' +
              '\ndigest: "'
          : '\n ⨯ Error: Boom' +
              '\n    at throwError (./app/ssr-throw/page.js:6:11)' +
              '\n    at Page (./app/ssr-throw/page.js:9:5)' +
              '\ndigest: "'
      )
      expect(cliOutput).toMatch(/digest: "\d+"/)
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
      // TODO(veil): Hide Node.js internal stackframes
      expect(cliOutput).toContain(
        isTurbopack
          ? '\n ⨯ Error: Boom' +
              '\n    at throwError (./app/rsc-throw/page.js:2:9)' +
              '\n    at Page (./app/rsc-throw/page.js:6:3)' +
              // TODO(veil): Hide Node.js internal stackframes
              '\n    at AsyncLocalStorage.run (node:async_hooks:346:14)' +
              '\ndigest: "'
          : '\n ⨯ Error: Boom' +
              '\n    at throwError (./app/rsc-throw/page.js:6:11)' +
              '\n    at Page (./app/rsc-throw/page.js:9:5)' +
              // TODO(veil): Hide Node.js internal stackframes
              '\n    at AsyncLocalStorage.run (node:async_hooks:346:14)' +
              '\ndigest: "'
      )
      expect(cliOutput).toMatch(/digest: "\d+"/)
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })
})
