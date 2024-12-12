/* eslint-disable jest/no-standalone-expect */
import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

function normalizeCliOutput(output: string) {
  return stripAnsi(output)
}

describe('app-dir - server source maps', () => {
  const dependencies =
    // 'link:' is not suitable for this test since this makes packages
    // not appear in node_modules.
    {
      'internal-pkg': `file:${path.resolve(__dirname, 'fixtures/default/internal-pkg')}`,
      'external-pkg': `file:${path.resolve(__dirname, 'fixtures/default/external-pkg')}`,
    }
  const { skipped, next, isNextDev, isTurbopack } = nextTestSetup({
    dependencies,
    files: path.join(__dirname, 'fixtures/default'),
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
          '\n    at logError (app/rsc-error-log/page.js:4:16)' +
          (isTurbopack
            ? '\n    at Page (app/rsc-error-log/page.js:11:2)'
            : // TODO(veil): Method name should be "Page"
              '\n    at logError (app/rsc-error-log/page.js:11:2)') +
          '\n  2 |' +
          '\n  3 | function logError() {' +
          "\n> 4 |   const error = new Error('Boom')" +
          '\n    |                ^' +
          '\n  5 |   console.error(error)' +
          '\n  6 | }' +
          '\n  7 |' +
          '\n'
      )
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('logged errors have a sourcemapped `cause`', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/rsc-error-log-cause')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '\nError: Boom' +
          '\n    at logError (app/rsc-error-log-cause/page.js:4:16)' +
          (isTurbopack
            ? '\n    at Page (app/rsc-error-log-cause/page.js:12:2)'
            : // FIXME: Method name should be "Page"
              '\n    at logError (app/rsc-error-log-cause/page.js:12:2)') +
          '\n  2 |' +
          '\n  3 | function logError(cause) {' +
          "\n> 4 |   const error = new Error('Boom', { cause })" +
          '\n    |                ^' +
          '\n  5 |   console.error(error)' +
          '\n  6 | }' +
          '\n  7 | {' +
          '\n  [cause]: Error: Boom' +
          '\n      at Page (app/rsc-error-log-cause/page.js:11:16)' +
          '\n     9 |   await connection()' +
          '\n    10 |' +
          "\n  > 11 |   const error = new Error('Boom')" +
          '\n       |                ^' +
          '\n    12 |   logError(error)' +
          '\n    13 |   return null' +
          '\n    14 | }' +
          '\n'
      )
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  // TODO(veil): Turbopack resolver bug
  // TODO(veil): Turbopack build? bugs taint the whole dev server
  ;(isTurbopack ? it.skip : it)(
    'stack frames are ignore-listed in ssr',
    async () => {
      const outputIndex = next.cliOutput.length
      await next.render('/ssr-error-log-ignore-listed')

      if (isNextDev) {
        await retry(() => {
          expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
        })
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          isTurbopack
            ? // TODO(veil): Turbopack resolver bug
              "Module not found: Can't resolve 'internal-pkg'"
            : '\nError: Boom' +
                '\n    at logError (app/ssr-error-log-ignore-listed/page.js:8:16)' +
                // TODO(veil): Method name should be "runWithExternalSourceMapped"
                '\n    at logError (app/ssr-error-log-ignore-listed/page.js:17:10)' +
                '\n    at runWithExternal (app/ssr-error-log-ignore-listed/page.js:16:32)' +
                '\n    at runWithInternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:15:18)' +
                '\n    at runWithInternal (app/ssr-error-log-ignore-listed/page.js:14:28)' +
                '\n    at Page (app/ssr-error-log-ignore-listed/page.js:13:14)' +
                '\n   6 |' +
                '\n'
        )
      } else {
        // TODO: Test `next build` with `--enable-source-maps`.
      }
    }
  )

  // TODO(veil): Turbopack resolver bug
  // TODO(veil): Turbopack build? bugs taint the whole dev server
  ;(isTurbopack ? it.skip : it)(
    'stack frames are ignore-listed in rsc',
    async () => {
      const outputIndex = next.cliOutput.length
      await next.render('/rsc-error-log-ignore-listed')

      if (isNextDev) {
        await retry(() => {
          expect(
            normalizeCliOutput(next.cliOutput.slice(outputIndex))
          ).toContain('Error: Boom')
        })
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          isTurbopack
            ? // TODO(veil): Turbopack resolver bug
              "Module not found: Can't resolve 'internal-pkg'"
            : '\nError: Boom' +
                '\n    at logError (app/rsc-error-log-ignore-listed/page.js:8:16)' +
                // TODO(veil): Method name should be "runWithExternalSourceMapped"
                '\n    at logError (app/rsc-error-log-ignore-listed/page.js:19:10)' +
                '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:18:32)' +
                '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:17:18)' +
                '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:16:28)' +
                '\n    at Page (app/rsc-error-log-ignore-listed/page.js:15:14)' +
                '\n   6 |' +
                '\n'
        )
      } else {
        // TODO: Test `next build` with `--enable-source-maps`.
      }
    }
  )

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
              '\n    at throwError (app/ssr-throw/Thrower.js:4:8)' +
              '\n    at Thrower (app/ssr-throw/Thrower.js:8:2)' +
              '\n  2 |' +
              '\n  3 | function throwError() {' +
              "\n> 4 |   throw new Error('Boom')" +
              '\n    |        ^' +
              '\n  5 | }' +
              '\n  6 |' +
              '\n  7 | export function Thrower() { {' +
              "\n  digest: '"
          : '\n ⨯ Error: Boom' +
              '\n    at throwError (app/ssr-throw/Thrower.js:4:8)' +
              // TODO(veil): Method name should be "Thrower"
              '\n    at throwError (app/ssr-throw/Thrower.js:8:2)' +
              '\n  2 |' +
              '\n  3 | function throwError() {' +
              "\n> 4 |   throw new Error('Boom')" +
              '\n    |        ^' +
              '\n  5 | }' +
              '\n  6 |' +
              '\n  7 | export function Thrower() { {' +
              "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('logged errors preserve their name', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/rsc-error-log-custom-name')

    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        // TODO: isNextDev ? 'UnnamedError: Foo' : '[Error]: Foo'
        isNextDev ? 'Error: Foo' : 'Error: Foo'
      )
    })

    expect(next.cliOutput.slice(outputIndex)).toContain(
      // TODO: isNextDev ? 'NamedError [MyError]: Bar' : '[MyError]: Bar'
      isNextDev ? 'Error [MyError]: Bar' : 'Error [MyError]: Bar'
    )
  })
})
