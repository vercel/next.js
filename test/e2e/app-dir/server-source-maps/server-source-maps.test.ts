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
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      await next.render('/rsc-error-log')

      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          'Error: rsc-error-log'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '\nError: rsc-error-log' +
          '\n    at logError (app/rsc-error-log/page.js:4:16)' +
          '\n    at Page (app/rsc-error-log/page.js:9:2)' +
          '\n  2 |' +
          '\n  3 | function logError() {' +
          "\n> 4 |   const error = new Error('rsc-error-log')" +
          '\n    |                ^' +
          '\n  5 |   console.error(error)' +
          '\n  6 | }' +
          '\n  7 |' +
          '\n'
      )
    } else {
      if (isTurbopack) {
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(turbopack:///[project]/app/rsc-error-log/page.js:4:16)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n> 4 |   const error = new Error('rsc-error-log')" +
            '\n    |                ^'
        )
      } else {
        // TODO(veil): line/column numbers are flaky in Webpack
      }
    }
  })

  it('logged errors have a sourcemapped `cause`', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      await next.render('/rsc-error-log-cause')

      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          'Error: rsc-error-log-cause'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '\nError: rsc-error-log-cause' +
          '\n    at logError (app/rsc-error-log-cause/page.js:2:16)' +
          '\n    at Page (app/rsc-error-log-cause/page.js:8:2)' +
          '\n  1 | function logError(cause) {' +
          "\n> 2 |   const error = new Error('rsc-error-log-cause', { cause })" +
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
    } else {
      if (isTurbopack) {
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(turbopack:///[project]/app/rsc-error-log-cause/page.js:2:16)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(turbopack:///[project]/app/rsc-error-log-cause/page.js:7:16)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n> 2 |   const error = new Error('rsc-error-log-cause', { cause })" +
            '\n    |                ^'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n  >  7 |   const error = new Error('Boom')" +
            '\n       |                ^'
        )
      } else {
        // TODO(veil): line/column numbers are flaky in Webpack
      }
    }
  })

  it('stack frames are ignore-listed in ssr', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/ssr-error-log-ignore-listed')

      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          'Error: ssr-error-log-ignore-listed'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        isTurbopack
          ? '\nError: ssr-error-log-ignore-listed' +
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
          : '\nError: ssr-error-log-ignore-listed' +
              '\n    at logError (app/ssr-error-log-ignore-listed/page.js:9:16)' +
              '\n    at runWithInternalIgnored (app/ssr-error-log-ignore-listed/page.js:19:12)' +
              // TODO(veil-NDX-910): Webpacks's sourcemap loader drops `ignoreList`
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
      if (isTurbopack) {
        // TODO(veil): Turbopack errors because it thinks the sources are not part of the project.
        // TODO(veil-NDX-910): Turbopack's sourcemap loader drops `ignoreList` in browser sourcemaps.
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "ssr-error-log-ignore-listed",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/ssr-error-log-ignore-listed/page.js (9:17) @ logError
         >  9 |   const error = new Error('ssr-error-log-ignore-listed')
              |                 ^",
           "stack": [
             "logError app/ssr-error-log-ignore-listed/page.js (9:17)",
             "runWithInternalIgnored app/ssr-error-log-ignore-listed/page.js (19:13)",
             "<FIXME-file-protocol>",
             "runWithExternalSourceMapped app/ssr-error-log-ignore-listed/page.js (18:28)",
             "<FIXME-file-protocol>",
             "runWithExternal app/ssr-error-log-ignore-listed/page.js (17:31)",
             "runWithInternalSourceMapped app/ssr-error-log-ignore-listed/page.js (16:17)",
             "<FIXME-file-protocol>",
             "runWithInternal app/ssr-error-log-ignore-listed/page.js (15:27)",
             "runInternal internal-pkg/index.js (2:10)",
             "Page app/ssr-error-log-ignore-listed/page.js (14:13)",
           ],
         }
        `)
      } else {
        // TODO(veil-NDX-910): Webpacks's sourcemap loader drops `ignoreList`
        // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "ssr-error-log-ignore-listed",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/ssr-error-log-ignore-listed/page.js (9:17) @ logError
         >  9 |   const error = new Error('ssr-error-log-ignore-listed')
              |                 ^",
           "stack": [
             "logError app/ssr-error-log-ignore-listed/page.js (9:17)",
             "runWithInternalIgnored app/ssr-error-log-ignore-listed/page.js (19:13)",
             "runInternalIgnored ignored.ts (6:10)",
             "runWithExternalSourceMapped app/ssr-error-log-ignore-listed/page.js (18:29)",
             "runWithExternal app/ssr-error-log-ignore-listed/page.js (17:32)",
             "runWithInternalSourceMapped app/ssr-error-log-ignore-listed/page.js (16:18)",
             "runInternalSourceMapped sourcemapped.ts (5:10)",
             "runWithInternal app/ssr-error-log-ignore-listed/page.js (15:28)",
             "runInternal internal-pkg/index.js (2:10)",
             "Page app/ssr-error-log-ignore-listed/page.js (14:14)",
           ],
         }
        `)
      }
    } else {
      if (isTurbopack) {
        // TODO(veil): Sourcemapping line off
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(turbopack:///[project]/app/ssr-error-log-ignore-listed/page.js:24:2)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '\n> 24 |   })\n     |  ^'
        )
      } else {
        // TODO(veil): line/column numbers are flaky in Webpack
      }
    }
  })

  it('stack frames are ignore-listed in rsc', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/rsc-error-log-ignore-listed')

    if (isNextDev) {
      await retry(() => {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          'Error: rsc-error-log-ignore-listed'
        )
      })
      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        isTurbopack
          ? '\nError: rsc-error-log-ignore-listed' +
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:8:16)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:18:12)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:17:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:16:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:15:18)' +
              // Realpath does not point into node_modules so we don't ignore it.
              // TODO(veil): Should be internal-pkg/sourcemapped.ts
              '\n    at runInternalSourceMapped (sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:14:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:13:14)' +
              '\n   6 |' +
              '\n'
          : '\nError: rsc-error-log-ignore-listed' +
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:8:16)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:18:12)' +
              // TODO(veil): Webpacks's sourcemap loader drops `ignoreList`
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              '\n    at runInternalIgnored (webpack-internal:/(rsc)/internal-pkg/ignored.ts:6:9)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:17:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:16:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:15:18)' +
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (webpack-internal:/(rsc)/internal-pkg/sourcemapped.ts:5:9)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:14:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:9)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:13:14)' +
              '\n   6 |' +
              '\n'
      )
    } else {
      if (isTurbopack) {
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          'at <unknown> (turbopack:///[project]/app/rsc-error-log-ignore-listed/page.js:8:16)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n>  8 |   const error = new Error('rsc-error-log-ignore-listed')" +
            '\n     |                ^'
        )
      } else {
        // TODO(veil): line/column numbers are flaky in Webpack
      }
    }
  })

  it('thrown SSR errors', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/ssr-throw')

      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain('Error: ssr-throw')
      })

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(cliOutput).toContain(
        '\n ⨯ Error: ssr-throw' +
          '\n    at throwError (app/ssr-throw/Thrower.js:4:8)' +
          '\n    at Thrower (app/ssr-throw/Thrower.js:8:2)' +
          '\n  2 |' +
          '\n  3 | function throwError() {' +
          "\n> 4 |   throw new Error('ssr-throw')" +
          '\n    |        ^' +
          '\n  5 | }' +
          '\n  6 |' +
          '\n  7 | export function Thrower() { {' +
          "\n  digest: '"
      )
      expect(cliOutput).toMatch(/digest: '\d+'/)

      await expect(browser).toDisplayRedbox(`
       {
         "description": "ssr-throw",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/ssr-throw/Thrower.js (4:9) @ throwError
       > 4 |   throw new Error('ssr-throw')
           |         ^",
         "stack": [
           "throwError app/ssr-throw/Thrower.js (4:9)",
           "Thrower app/ssr-throw/Thrower.js (8:3)",
           "Page app/ssr-throw/page.js (6:10)",
         ],
       }
      `)
    } else {
      // SSR errors are not logged because React retries them during hydration.
    }
  })

  it('logged errors preserve their name', async () => {
    let cliOutput = next.cliOutput
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      await next.render('/rsc-error-log-custom-name')
      cliOutput = next.cliOutput.slice(outputIndex)
    }

    await retry(() => {
      expect(cliOutput).toContain(
        // TODO: isNextDev ? 'UnnamedError: rsc-error-log-custom-name-Foo' : '[Error]: rsc-error-log-custom-name-Foo'
        isNextDev
          ? 'Error: rsc-error-log-custom-name-Foo'
          : 'Error: rsc-error-log-custom-name-Foo'
      )
    })

    expect(cliOutput).toContain(
      // TODO: isNextDev ? 'NamedError [MyError]: rsc-error-log-custom-name-Bar' : '[MyError]: rsc-error-log-custom-name-Bar'
      isNextDev
        ? 'Error [MyError]: rsc-error-log-custom-name-Bar'
        : 'Error [MyError]: rsc-error-log-custom-name-Bar'
    )
  })

  it('handles invalid sourcemaps gracefully', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      await next.render('/bad-sourcemap')

      await retry(() => {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          'Error: bad-sourcemap'
        )
      })
      if (isTurbopack) {
        expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
          // Node.js is fine with invalid URLs in index maps apparently.
          '' +
            '\nError: bad-sourcemap' +
            '\n    at logError (custom://[badhost]/app/bad-sourcemap/page.js:6:16)' +
            '\n    at Page (custom://[badhost]/app/bad-sourcemap/page.js:10:2)' +
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
            '\nError: bad-sourcemap' +
            '\n    at logError (webpack-internal:///(rsc)/./app/bad-sourcemap/page.js:12:19)' +
            '\n    at Page (webpack-internal:///(rsc)/./app/bad-sourcemap/page.js:15:5)'
        )
        // Expect the invalid sourcemap warning only once per render.
        // Dynamic I/O renders three times.
        expect(
          normalizeCliOutput(next.cliOutput.slice(outputIndex)).split(
            'Invalid source map.'
          ).length - 1
        ).toEqual(3)
      }
    } else {
      if (isTurbopack) {
        // Expect the invalid sourcemap warning only once per render.
        expect(
          normalizeCliOutput(next.cliOutput).split('Invalid source map.')
            .length - 1
        ).toEqual(
          // >= 20
          // behavior in Node.js 20+ is intended
          process.versions.node.startsWith('18') ? 0 : 2
        )
      } else {
        // Webpack is silent about invalid sourcemaps for next build.
        expect(
          normalizeCliOutput(next.cliOutput).split('Invalid source map.')
            .length - 1
        ).toEqual(0)
      }
    }
  })
})
