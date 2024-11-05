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
    // 'link:' is not suitable for this test since this makes internal-pkg
    // not appear in node_modules.
    {
      'internal-pkg': `file:${path.resolve(__dirname, 'fixtures/default/internal-pkg')}`,
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
    await next.render('/rsc-error-log')

    if (isNextDev) {
      await retry(() => {
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          isTurbopack
            ? '\nError: Boom' +
                '\n    at logError (turbopack://[project]/app/rsc-error-log/page.js:2:16)' +
                '\n    at Page (turbopack://[project]/app/rsc-error-log/page.js:7:2)' +
                '\n  1 | function logError() {' +
                "\n> 2 |   const error = new Error('Boom')" +
                '\n    |                ^' +
                '\n  3 |   console.error(error)' +
                '\n  4 | }' +
                '\n  5 |' +
                '\n'
            : '\nError: Boom' +
                '\n    at logError (app/rsc-error-log/page.js:2:16)' +
                // FIXME: Method name should be "Page"
                '\n    at logError (app/rsc-error-log/page.js:7:2)' +
                '\n  1 | function logError() {' +
                "\n> 2 |   const error = new Error('Boom')" +
                '\n    |                ^' +
                '\n  3 |   console.error(error)' +
                '\n  4 | }' +
                '\n  5 |' +
                '\n'
        )
      })
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('logged errors have a sourcemapped `cause`', async () => {
    await next.render('/rsc-error-log-cause')

    if (isNextDev) {
      await retry(() => {
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          isTurbopack
            ? '\nError: Boom' +
                '\n    at logError (turbopack://[project]/app/rsc-error-log-cause/page.js:2:16)' +
                '\n    at Page (turbopack://[project]/app/rsc-error-log-cause/page.js:8:2)' +
                '\n  1 | function logError(cause) {' +
                "\n> 2 |   const error = new Error('Boom', { cause })" +
                '\n    |                ^' +
                '\n  3 |   console.error(error)' +
                '\n  4 | }' +
                '\n  5 | {' +
                '\n  [cause]: Error: Boom' +
                '\n      at Page (turbopack://[project]/app/rsc-error-log-cause/page.js:7:16)' +
                '\n     5 |' +
                '\n     6 | export default function Page() {' +
                "\n  >  7 |   const error = new Error('Boom')" +
                '\n       |                ^' +
                '\n     8 |   logError(error)' +
                '\n     9 |   return null' +
                '\n    10 | }' +
                '\n'
            : '\nError: Boom' +
                '\n    at logError (app/rsc-error-log-cause/page.js:2:16)' +
                // FIXME: Method name should be "Page"
                '\n    at logError (app/rsc-error-log-cause/page.js:8:2)' +
                '\n  1 | function logError(cause) {' +
                "\n> 2 |   const error = new Error('Boom', { cause })" +
                '\n    |                ^' +
                '\n  3 |   console.error(error)' +
                '\n  4 | }' +
                '\n  5 | {' +
                '\n  [cause]: Error: Boom' +
                '\n      at Page (app/rsc-error-log-cause/page.js:7:16)' +
                '\n     5 |' +
                '\n     6 | export default function Page() {' +
                "\n  >  7 |   const error = new Error('Boom')" +
                '\n       |                ^' +
                '\n     8 |   logError(error)' +
                '\n     9 |   return null' +
                '\n    10 | }' +
                '\n'
        )
      })
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  // FIXME: Turbopack resolver bug
  // FIXME: Turbopack build? bugs taint the whole dev server
  ;(isTurbopack ? it.skip : it)(
    'stack frames are ignore-listed in ssr',
    async () => {
      await next.render('/ssr-error-log-ignore-listed')

      if (isNextDev) {
        await retry(() => {
          expect(normalizeCliOutput(next.cliOutput)).toContain(
            isTurbopack
              ? // FIXME: Turbopack resolver bug
                "Module not found: Can't resolve 'internal-pkg'"
              : '\nError: Boom' +
                  '\n    at logError (app/ssr-error-log-ignore-listed/page.js:5:16)' +
                  // FIXME: Method name should be "Page"
                  '\n    at logError (app/ssr-error-log-ignore-listed/page.js:10:12)' +
                  '\n    at Page (app/ssr-error-log-ignore-listed/page.js:10:6)' +
                  '\n  3 |'
          )
        })
      } else {
        // TODO: Test `next build` with `--enable-source-maps`.
      }
    }
  )

  // FIXME: Turbopack resolver bug
  // FIXME: Turbopack build? bugs taint the whole dev server
  ;(isTurbopack ? it.skip : it)(
    'stack frames are ignore-listed in rsc',
    async () => {
      await next.render('/rsc-error-log-ignore-listed')

      if (isNextDev) {
        await retry(() => {
          expect(normalizeCliOutput(next.cliOutput)).toContain(
            isTurbopack
              ? // FIXME: Turbopack resolver bug
                "Module not found: Can't resolve 'internal-pkg'"
              : '\nError: Boom' +
                  '\n    at logError (app/rsc-error-log-ignore-listed/page.js:4:16)' +
                  // FIXME: Method name should be "Page"
                  '\n    at logError (app/rsc-error-log-ignore-listed/page.js:9:12)' +
                  '\n    at Page (app/rsc-error-log-ignore-listed/page.js:9:6)' +
                  '\n  2 |'
          )
        })
      } else {
        // TODO: Test `next build` with `--enable-source-maps`.
      }
    }
  )

  it('logged errors preserve their name', async () => {
    await next.render('/rsc-error-log-custom-name')

    expect(next.cliOutput).toContain(
      // TODO: isNextDev ? 'UnnamedError: Foo' : '[Error]: Foo'
      isNextDev ? 'Error: Foo' : 'Error: Foo'
    )
    expect(next.cliOutput).toContain(
      // TODO: isNextDev ? 'NamedError [MyError]: Bar' : '[MyError]: Bar'
      isNextDev ? 'Error [MyError]: Bar' : 'Error [MyError]: Bar'
    )
  })
})
