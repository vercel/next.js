/* eslint-disable jest/no-standalone-expect */
import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

function normalizeCliOutput(output: string) {
  return stripAnsi(output)
}

describe('app-dir - server source maps', () => {
  const dependencies = {
    // `link:` simulates a package in a monorepo
    'internal-pkg': `link:./internal-pkg`,
    'external-pkg': `file:./external-pkg`,
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
          '\n    at logError (app/rsc-error-log/page.js:5:16)' +
          '\n    at Page (app/rsc-error-log/page.js:12:2)' +
          '\n  3 |' +
          '\n  4 | function logError() {' +
          "\n> 5 |   const error = new Error('Boom')" +
          '\n    |                ^' +
          '\n  6 |   console.error(error)' +
          '\n  7 | }' +
          '\n  8 |' +
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
            : '\n    at Page (app/rsc-error-log-cause/page.js:12:2)') +
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

  it('stack frames are ignore-listed in ssr', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/ssr-error-log-ignore-listed')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        isTurbopack
          ? '\nError: Boom' +
              '\n    at logError (app/ssr-error-log-ignore-listed/page.js:9:16)' +
              '\n    at runWithInternalIgnored (app/ssr-error-log-ignore-listed/page.js:19:12)' +
              '\n    at runWithExternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:18:29)' +
              '\n    at runWithExternal (app/ssr-error-log-ignore-listed/page.js:17:32)' +
              '\n    at runWithInternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:16:18)' +
              // Realpath does not point into node_modules so we don't ignore it.
              // TODO(veil): Should be internal-pkg/sourcemapped.ts
              '\n    at runInternalSourceMapped (sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/ssr-error-log-ignore-listed/page.js:15:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/ssr-error-log-ignore-listed/page.js:14:14)' +
              '\n   7 |' +
              '\n'
          : '\nError: Boom' +
              '\n    at logError (app/ssr-error-log-ignore-listed/page.js:9:16)' +
              '\n    at runWithInternalIgnored (app/ssr-error-log-ignore-listed/page.js:19:12)' +
              // TODO(veil): Webpacks's sourcemap loader drops `ignoreList`
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              '\n    at runInternalIgnored (webpack-internal:/(ssr)/internal-pkg/ignored.ts:6:9)' +
              '\n    at runWithExternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:18:29)' +
              '\n    at runWithExternal (app/ssr-error-log-ignore-listed/page.js:17:32)' +
              '\n    at runWithInternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:16:18)' +
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (webpack-internal:/(ssr)/internal-pkg/sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/ssr-error-log-ignore-listed/page.js:15:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/ssr-error-log-ignore-listed/page.js:14:14)' +
              '\n   7 |' +
              '\n'
      )
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('stack frames are ignore-listed in rsc', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/rsc-error-log-ignore-listed')

    if (isNextDev) {
      await retry(() => {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          'Error: Boom'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        isTurbopack
          ? '\nError: Boom' +
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:9:16)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:21:12)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:20:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:19:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:18:18)' +
              // Realpath does not point into node_modules so we don't ignore it.
              // TODO(veil): Should be internal-pkg/sourcemapped.ts
              '\n    at runInternalSourceMapped (sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:17:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:16:14)' +
              '\n   7 |' +
              '\n'
          : '\nError: Boom' +
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:9:16)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:21:12)' +
              // TODO(veil): Webpacks's sourcemap loader drops `ignoreList`
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              '\n    at runInternalIgnored (webpack-internal:/(rsc)/internal-pkg/ignored.ts:6:9)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:20:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:19:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:18:18)' +
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (webpack-internal:/(rsc)/internal-pkg/sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:17:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:16:14)' +
              '\n   7 |' +
              '\n'
      )
    } else {
      // TODO: Test `next build` with `--enable-source-maps`.
    }
  })

  it('thrown SSR errors', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/ssr-throw')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: Boom' +
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
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 2,
           "description": "Error: Boom",
           "environmentLabel": null,
           "label": "Unhandled Runtime Error",
           "source": "app/ssr-throw/Thrower.js (4:9) @ throwError
         > 4 |   throw new Error('Boom')
             |         ^",
           "stack": [
             "throwError app/ssr-throw/Thrower.js (4:9)",
             "Thrower app/ssr-throw/Thrower.js (8:3)",
             "Page app/ssr-throw/page.js (6:11)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 2,
           "description": "Error: Boom",
           "environmentLabel": null,
           "label": "Unhandled Runtime Error",
           "source": "app/ssr-throw/Thrower.js (4:9) @ throwError
         > 4 |   throw new Error('Boom')
             |         ^",
           "stack": [
             "throwError app/ssr-throw/Thrower.js (4:9)",
             "Thrower app/ssr-throw/Thrower.js (8:3)",
             "Page app/ssr-throw/page.js (6:11)",
           ],
         }
        `)
      }
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

  it('handles invalid sourcemaps gracefully', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/bad-sourcemap')

    await retry(() => {
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        'Error: Boom!'
      )
    })

    if (isNextDev) {
      if (isTurbopack) {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          // Node.js is fine with invalid URLs in index maps apparently.
          '' +
            '\nError: Boom!' +
            '\n    at Page (custom://[badhost]/app/bad-sourcemap/page.js:9:15)' +
            // TODO: Remove blank line
            '\n'
        )
      } else {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          // Node.js is not fine with invalid URLs in vanilla source maps.
          // Feel free to adjust these locations. They're just here to showcase
          // sourcemapping is broken on invalid sources.
          '' +
            `\nwebpack-internal:///(rsc)/./app/bad-sourcemap/page.js: Invalid source map. Only conformant source maps can be used to find the original code. Cause: TypeError [ERR_INVALID_ARG_TYPE]: The "payload" argument must be of type object. Received null` +
            '\nError: Boom!' +
            '\n    at Page (webpack-internal:///(rsc)/./app/bad-sourcemap/page.js:15:19)'
        )
      }
    } else {
      // TODO: test `next start` with `--enable-source-maps`
    }
  })

  it('sourcemaps errors during module evaluation', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/module-evaluation')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: Boom')
      })
      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      if (isTurbopack) {
        expect(cliOutput).toContain(
          '' +
            '\n ⨯ Error: Boom' +
            // TODO(veil): Should map to no name like you'd get with native stacks without a bundler.
            '\n    at [project]/app/module-evaluation/module.js [app-rsc] (ecmascript) (app/module-evaluation/module.js:1:6)' +
            // TODO(veil): Added frames from bundler should be sourcemapped (https://linear.app/vercel/issue/NDX-509/)
            '\n    at [project]/app/module-evaluation/page.js [app-rsc] (ecmascript) (app/module-evaluation/page.js:1:0)' +
            '\n    at [project]/app/module-evaluation/page.js [app-rsc] (ecmascript, Next.js server component) (.next'
        )
      } else {
        expect(cliOutput).toContain(
          '' +
            '\n ⨯ Error: Boom' +
            // TODO(veil): Should map to no name like you'd get with native stacks without a bundler.
            // TODO(veil): Location should be sourcemapped
            '\n    at eval (app/module-evaluation/module.js:1:6)' +
            // TODO(veil): Added frames from bundler should be sourcemapped (https://linear.app/vercel/issue/NDX-509/)
            '\n    at <unknown> (rsc)/.'
        )
      }

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: Boom",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/module-evaluation/module.js (1:7) @ [project]/app/module-evaluation/module.js [app-rsc] (ecmascript)
         > 1 | throw new Error('Boom')
             |       ^",
           "stack": [
             "[project]/app/module-evaluation/module.js [app-rsc] (ecmascript) app/module-evaluation/module.js (1:7)",
             "[project]/app/module-evaluation/page.js [app-rsc] (ecmascript) app/module-evaluation/page.js (1:1)",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: Boom",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/module-evaluation/module.js (1:7) @ eval
         > 1 | throw new Error('Boom')
             |       ^",
           "stack": [
             "eval app/module-evaluation/module.js (1:7)",
             "<FIXME-absolute-path>",
             "<FIXME-file-protocol>",
             "eval ./app/module-evaluation/page.js",
             "<FIXME-absolute-path>",
             "<FIXME-file-protocol>",
           ],
         }
        `)
      }
    } else {
      // TODO: test `next build` with `--enable-source-maps`
    }
  })
})
