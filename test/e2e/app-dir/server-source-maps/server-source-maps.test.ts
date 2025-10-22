import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

function normalizeCliOutput(output: string) {
  return (
    stripAnsi(output)
      // TODO(veil): Should not appear in sourcemapped stackframes.
      .replaceAll('webpack:///', 'bundler:///')
      .replaceAll('turbopack:///[project]/', 'bundler:///')
      .replaceAll(/at [a-zA-Z] \(/g, 'at <mangled> (')
  )
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
  const isRspack = !!process.env.NEXT_RSPACK

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
          '\n    at logError (app/rsc-error-log/page.js:4:17)' +
          '\n    at Page (app/rsc-error-log/page.js:9:3)' +
          '\n  2 |' +
          '\n  3 | function logError() {' +
          "\n> 4 |   const error = new Error('rsc-error-log')" +
          '\n    |                 ^' +
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
          '(bundler:///app/rsc-error-log/page.js:4:17)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n> 4 |   const error = new Error('rsc-error-log')" +
            '\n    |                 ^'
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
          '\n    at logError (app/rsc-error-log-cause/page.js:2:17)' +
          '\n    at Page (app/rsc-error-log-cause/page.js:8:3)' +
          '\n  1 | function logError(cause) {' +
          "\n> 2 |   const error = new Error('rsc-error-log-cause', { cause })" +
          '\n    |                 ^' +
          '\n  3 |   console.error(error)' +
          '\n  4 | }' +
          '\n  5 | {' +
          '\n  [cause]: Error: Boom' +
          '\n      at Page (app/rsc-error-log-cause/page.js:7:17)' +
          '\n     5 |' +
          '\n     6 | export default function Page() {' +
          "\n  >  7 |   const error = new Error('Boom')" +
          '\n       |                 ^' +
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
          '(bundler:///app/rsc-error-log-cause/page.js:2:17)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(bundler:///app/rsc-error-log-cause/page.js:7:17)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n> 2 |   const error = new Error('rsc-error-log-cause', { cause })" +
            '\n    |                 ^'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n  >  7 |   const error = new Error('Boom')" +
            '\n       |                 ^'
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
              '\n    at logError (app/ssr-error-log-ignore-listed/page.js:9:17)' +
              '\n    at runWithInternalIgnored (app/ssr-error-log-ignore-listed/page.js:19:13)' +
              '\n    at runWithExternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:18:29)' +
              '\n    at runWithExternal (app/ssr-error-log-ignore-listed/page.js:17:32)' +
              '\n    at runWithInternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:16:18)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (internal-pkg/sourcemapped.ts:5:10)' +
              '\n    at runWithInternal (app/ssr-error-log-ignore-listed/page.js:15:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:10)' +
              '\n    at Page (app/ssr-error-log-ignore-listed/page.js:14:14)' +
              '\n   7 |' +
              '\n'
          : '\nError: ssr-error-log-ignore-listed' +
              '\n    at logError (app/ssr-error-log-ignore-listed/page.js:9:17)' +
              '\n    at runWithInternalIgnored (app/ssr-error-log-ignore-listed/page.js:19:13)' +
              // TODO(veil-NDX-910): Webpacks's sourcemap loader drops `ignoreList`
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              '\n    at runInternalIgnored (webpack-internal:/(ssr)/internal-pkg/ignored.ts:6:10)' +
              '\n    at runWithExternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:18:29)' +
              '\n    at runWithExternal (app/ssr-error-log-ignore-listed/page.js:17:32)' +
              '\n    at runWithInternalSourceMapped (app/ssr-error-log-ignore-listed/page.js:16:18)' +
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (webpack-internal:/(ssr)/internal-pkg/sourcemapped.ts:5:10)' +
              '\n    at runWithInternal (app/ssr-error-log-ignore-listed/page.js:15:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:10)' +
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
             "runInternalIgnored internal-pkg/ignored.ts (6:10)",
             "runWithExternalSourceMapped app/ssr-error-log-ignore-listed/page.js (18:29)",
             "runWithExternal app/ssr-error-log-ignore-listed/page.js (17:32)",
             "runWithInternalSourceMapped app/ssr-error-log-ignore-listed/page.js (16:18)",
             "runInternalSourceMapped internal-pkg/sourcemapped.ts (5:10)",
             "runWithInternal app/ssr-error-log-ignore-listed/page.js (15:28)",
             "runInternal internal-pkg/index.js (2:10)",
             "Page app/ssr-error-log-ignore-listed/page.js (14:14)",
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
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '(bundler:///app/ssr-error-log-ignore-listed/page.js:9:17)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '\n' +
            ">  9 |   const error = new Error('ssr-error-log-ignore-listed')\n" +
            '     |                 ^\n'
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
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:8:17)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:18:13)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:17:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:16:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:15:18)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (internal-pkg/sourcemapped.ts:5:10)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:14:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:10)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:13:14)' +
              '\n   6 |' +
              '\n'
          : '\nError: rsc-error-log-ignore-listed' +
              '\n    at logError (app/rsc-error-log-ignore-listed/page.js:8:17)' +
              '\n    at runWithInternalIgnored (app/rsc-error-log-ignore-listed/page.js:18:13)' +
              // TODO(veil): Webpacks's sourcemap loader drops `ignoreList`
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              '\n    at runInternalIgnored (webpack-internal:/(rsc)/internal-pkg/ignored.ts:6:10)' +
              '\n    at runWithExternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:17:29)' +
              '\n    at runWithExternal (app/rsc-error-log-ignore-listed/page.js:16:32)' +
              '\n    at runWithInternalSourceMapped (app/rsc-error-log-ignore-listed/page.js:15:18)' +
              // TODO(veil): Webpack's sourcemap loader creates an incorrect `sources` entry.
              // Can be worked around by using `./sourcemapped.ts` instead of `sourcemapped.ts`.
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternalSourceMapped (webpack-internal:/(rsc)/internal-pkg/sourcemapped.ts:5:10)' +
              '\n    at runWithInternal (app/rsc-error-log-ignore-listed/page.js:14:28)' +
              // Realpath does not point into node_modules so we don't ignore it.
              '\n    at runInternal (internal-pkg/index.js:2:10)' +
              '\n    at Page (app/rsc-error-log-ignore-listed/page.js:13:14)' +
              '\n   6 |' +
              '\n'
      )
    } else {
      if (isTurbopack) {
        // TODO(veil): Sourcemap names
        // TODO(veil): relative paths
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          'at <unknown> (bundler:///app/rsc-error-log-ignore-listed/page.js:8:17)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n>  8 |   const error = new Error('rsc-error-log-ignore-listed')" +
            '\n     |                 ^'
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
        '⨯ Error: ssr-throw' +
          '\n    at throwError (app/ssr-throw/Thrower.js:4:9)' +
          '\n    at Thrower (app/ssr-throw/Thrower.js:8:3)' +
          '\n  2 |' +
          '\n  3 | function throwError() {' +
          "\n> 4 |   throw new Error('ssr-throw')" +
          '\n    |         ^' +
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
            '\n    at logError (app/bad-sourcemap/custom:/[badhost]/app/bad-sourcemap/page.js:6:17)' +
            '\n    at Page (app/bad-sourcemap/custom:/[badhost]/app/bad-sourcemap/page.js:10:3)' +
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
        // One from filterStackFrameDEV.
        // One from findSourceMapURLDEV.
        expect(
          normalizeCliOutput(next.cliOutput.slice(outputIndex)).split(
            'Invalid source map.'
          ).length - 1
        ).toEqual(5)
      }
    } else {
      // Bundlers silently drop invalid sourcemaps.
      expect(
        normalizeCliOutput(next.cliOutput).split('Invalid source map.').length -
          1
      ).toEqual(0)
    }
  })

  it('sourcemaps errors during module evaluation', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/module-evaluation')

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          'Error: module-evaluation'
        )
      })
      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      if (isTurbopack) {
        expect(cliOutput).toContain(
          'Error: module-evaluation' +
            // TODO(veil): Should map to no name like you'd get with native stacks without a bundler.
            '\n    at module evaluation (app/module-evaluation/module.js:1:22)' +
            // TODO(veil): Added frames from bundler should be sourcemapped (https://linear.app/vercel/issue/NDX-509/)
            '\n    at module evaluation (app/module-evaluation/page.js:1:1)' +
            '\n    at module evaluation (.next'
        )
      } else {
        expect(cliOutput).toContain(
          'Error: module-evaluation' +
            // TODO(veil): Should map to no name like you'd get with native stacks without a bundler.
            // TODO(veil): Location should be sourcemapped
            '\n    at eval (app/module-evaluation/module.js:1:22)' +
            // TODO(veil): Added frames from bundler should be sourcemapped (https://linear.app/vercel/issue/NDX-509/)
            '\n    at <unknown> (rsc)/.'
        )
      }

      expect(cliOutput).toContain(
        '' +
          "\n> 1 | export const error = new Error('module-evaluation')" +
          '\n    |                      ^'
      )

      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "module-evaluation",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/module-evaluation/module.js (1:22) @ module evaluation
         > 1 | export const error = new Error('module-evaluation')
             |                      ^",
           "stack": [
             "module evaluation app/module-evaluation/module.js (1:22)",
             "module evaluation app/module-evaluation/page.js (1:1)",
             "module evaluation app/module-evaluation/page.js (6:1)",
             "Page <anonymous>",
           ],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "module-evaluation",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/module-evaluation/module.js (1:22) @ eval
         > 1 | export const error = new Error('module-evaluation')
             |                      ^",
           "stack": [
             "eval app/module-evaluation/module.js (1:22)",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
             "eval about:/Prerender/webpack-internal:///(rsc)/app/module-evaluation/page.js (5:60)",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
             "Function.all <anonymous>",
             "Function.all <anonymous>",
             "Page <anonymous>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "module-evaluation",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/module-evaluation/module.js (1:22) @ eval
         > 1 | export const error = new Error('module-evaluation')
             |                      ^",
           "stack": [
             "eval app/module-evaluation/module.js (1:22)",
             "<FIXME-file-protocol>",
             "eval about:/Prerender/webpack-internal:///(rsc)/app/module-evaluation/page.js (5:65)",
             "<FIXME-file-protocol>",
             "Page <anonymous>",
           ],
         }
        `)
      }
    } else {
      if (isTurbopack) {
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            '\nError: module-evaluation' +
            // TODO(veil): Turbopack internals. Feel free to update. Tracked in https://linear.app/vercel/issue/NEXT-4362
            '\n    at module evaluation (bundler:///app/module-evaluation/module.js:1:22)'
        )
        expect(normalizeCliOutput(next.cliOutput)).toContain(
          '' +
            "\n> 1 | export const error = new Error('module-evaluation')" +
            '\n    |                      ^'
        )
      } else {
        expect(
          normalizeCliOutput(next.cliOutput).replaceAll(
            /at \d+ /g,
            'at <WebpackModuleID> '
          )
        ).toContain(
          '' +
            '\nError: module-evaluation' +
            // TODO(veil): column numbers are flaky in Webpack
            '\n    at <WebpackModuleID> (bundler:///app/module-evaluation/module.js:1:'
        )
      }
    }
  })

  it('ignore-lists anonymous rsc stack frame sandwiches', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/rsc-anonymous-stack-frame-sandwich')

      // TODO(veil): Implement sandwich heuristic in `filterStackFrameDEV`
      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "rsc-anonymous-stack-frame-sandwich: external",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (5:29) @ Page
         > 5 |   runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')
             |                             ^",
             "stack": [
               "Set.forEach <anonymous>",
               "Set.forEach <anonymous>",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (5:29)",
               "Page <anonymous>",
             ],
           },
           {
             "description": "rsc-anonymous-stack-frame-sandwich: internal",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (6:29) @ Page
         > 6 |   runHiddenSetOfSetsInternal('rsc-anonymous-stack-frame-sandwich: internal')
             |                             ^",
             "stack": [
               "Set.forEach <anonymous>",
               "Set.forEach <anonymous>",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (6:29)",
               "Page <anonymous>",
             ],
           },
         ]
        `)
      } else if (isRspack) {
        // 2nd error from runHiddenSetOfSetsInternal hits https://linear.app/vercel/issue/NEXT-4412
        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "rsc-anonymous-stack-frame-sandwich: external",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (5:29) @ Page
         > 5 |   runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')
             |                             ^",
             "stack": [
               "Set.forEach <anonymous>",
               "Set.forEach <anonymous>",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (5:29)",
               "Page <anonymous>",
             ],
           },
           {
             "description": "rsc-anonymous-stack-frame-sandwich: internal",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (6:29) @ Page
         > 6 |   runHiddenSetOfSetsInternal('rsc-anonymous-stack-frame-sandwich: internal')
             |                             ^",
             "stack": [
               "eval webpack-internal:/(ssr)/internal-pkg/ignored.ts (18:54)",
               "eval webpack-internal:/(ssr)/internal-pkg/ignored.ts (12:7)",
               "Set.forEach <anonymous>",
               "eval webpack-internal:/(ssr)/internal-pkg/ignored.ts (11:9)",
               "Set.forEach <anonymous>",
               "runSetOfSets webpack-internal:/(ssr)/internal-pkg/ignored.ts (10:13)",
               "runHiddenSetOfSets webpack-internal:/(ssr)/internal-pkg/ignored.ts (18:3)",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (6:29)",
               "Page <anonymous>",
             ],
           },
         ]
        `)
      } else {
        // 2nd error from runHiddenSetOfSetsInternal hits https://linear.app/vercel/issue/NEXT-4412
        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "rsc-anonymous-stack-frame-sandwich: external",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (5:29) @ Page
         > 5 |   runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')
             |                             ^",
             "stack": [
               "Set.forEach <anonymous>",
               "Set.forEach <anonymous>",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (5:29)",
               "Page <anonymous>",
             ],
           },
           {
             "description": "rsc-anonymous-stack-frame-sandwich: internal",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/rsc-anonymous-stack-frame-sandwich/page.js (6:29) @ Page
         > 6 |   runHiddenSetOfSetsInternal('rsc-anonymous-stack-frame-sandwich: internal')
             |                             ^",
             "stack": [
               "eval webpack-internal:/(rsc)/internal-pkg/ignored.ts (18:54)",
               "eval webpack-internal:/(rsc)/internal-pkg/ignored.ts (12:7)",
               "Set.forEach <anonymous>",
               "eval webpack-internal:/(rsc)/internal-pkg/ignored.ts (11:9)",
               "Set.forEach <anonymous>",
               "runSetOfSets webpack-internal:/(rsc)/internal-pkg/ignored.ts (10:13)",
               "runHiddenSetOfSets webpack-internal:/(rsc)/internal-pkg/ignored.ts (18:3)",
               "Page app/rsc-anonymous-stack-frame-sandwich/page.js (6:29)",
               "Page <anonymous>",
             ],
           },
         ]
        `)
      }

      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '' +
          '\nError: rsc-anonymous-stack-frame-sandwich: external' +
          '\n    at Page (app/rsc-anonymous-stack-frame-sandwich/page.js:5:29)' +
          '\n  3 |' +
          '\n  4 | export default function Page() {' +
          "\n> 5 |   runHiddenSetOfSetsExternal('rsc-anonymous-stack-frame-sandwich: external')" +
          '\n    |                             ^'
      )
      // TODO: assert on 2nd error once that's bug free
    } else {
      // TODO(veil): assert on 1st error once cursor position is consistent
      // TODO(veil): assert on 2nd error once that's bug free
    }
  })

  it('ignore-lists anonymous ssr stack frame sandwiches', async () => {
    if (isNextDev) {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/ssr-anonymous-stack-frame-sandwich')

      if (isTurbopack) {
        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "ssr-anonymous-stack-frame-sandwich: external",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "app/ssr-anonymous-stack-frame-sandwich/page.js (6:29) @ Page
         > 6 |   runHiddenSetOfSetsExternal('ssr-anonymous-stack-frame-sandwich: external')
             |                             ^",
             "stack": [
               "Page app/ssr-anonymous-stack-frame-sandwich/page.js (6:29)",
             ],
           },
           {
             "description": "ignore-listed frames",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "internal-pkg/sourcemapped.ts (9:13) @ runSetOfSets",
             "stack": [
               "<unknown> internal-pkg/sourcemapped.ts (18:43)",
               "<unknown> internal-pkg/sourcemapped.ts (11:7)",
               "Set.forEach <anonymous>",
               "<unknown> internal-pkg/sourcemapped.ts (10:9)",
               "Set.forEach <anonymous>",
               "runSetOfSets internal-pkg/sourcemapped.ts (9:13)",
               "runHiddenSetOfSets internal-pkg/sourcemapped.ts (17:3)",
               "Page app/ssr-anonymous-stack-frame-sandwich/page.js (7:29)",
             ],
           },
         ]
        `)
      } else {
        // 2nd error from runHiddenSetOfSetsInternal hits https://linear.app/vercel/issue/NEXT-4412
        await expect(browser).toDisplayCollapsedRedbox(`
         [
           {
             "description": "ssr-anonymous-stack-frame-sandwich: external",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "app/ssr-anonymous-stack-frame-sandwich/page.js (6:29) @ Page
         > 6 |   runHiddenSetOfSetsExternal('ssr-anonymous-stack-frame-sandwich: external')
             |                             ^",
             "stack": [
               "Page app/ssr-anonymous-stack-frame-sandwich/page.js (6:29)",
             ],
           },
           {
             "description": "ignore-listed frames",
             "environmentLabel": null,
             "label": "Console Error",
             "source": "app/ssr-anonymous-stack-frame-sandwich/page.js (7:29) @ Page
         >  7 |   runHiddenSetOfSetsInternal('ssr-anonymous-stack-frame-sandwich: internal')
              |                             ^",
             "stack": [
               "eval sourcemapped.ts (18:43)",
               "eval sourcemapped.ts (11:7)",
               "Set.forEach <anonymous>",
               "eval sourcemapped.ts (10:9)",
               "Set.forEach <anonymous>",
               "runSetOfSets sourcemapped.ts (9:13)",
               "runHiddenSetOfSets sourcemapped.ts (17:3)",
               "Page app/ssr-anonymous-stack-frame-sandwich/page.js (7:29)",
             ],
           },
         ]
        `)
      }

      expect(normalizeCliOutput(next.cliOutput.slice(outputIndex))).toContain(
        '' +
          '\nError: ssr-anonymous-stack-frame-sandwich: external' +
          '\n    at Page (app/ssr-anonymous-stack-frame-sandwich/page.js:6:29)' +
          '\n  4 |' +
          '\n  5 | export default function Page() {' +
          "\n> 6 |   runHiddenSetOfSetsExternal('ssr-anonymous-stack-frame-sandwich: external')" +
          '\n    |                             ^'
      )
      // TODO(veil): assert on 2nd error once that's bug free
    } else {
      // TODO(veil): assert on 1st error once cursor position is consistent
      // TODO(veil): assert on 2nd error once that's bug free
    }
  })
})
