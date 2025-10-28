import { assertNoRedbox, check, getDistDir, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'

describe('middleware - development errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })
  const isRspack = !!process.env.NEXT_RSPACK

  beforeEach(async () => {
    await next.stop()
  })

  describe('when middleware throws synchronously', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      export default function () {
        throw new Error('boom')
      }`
      )

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')

      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain('boom')
      })
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ Error: boom' +
              // TODO(veil): Sourcemap to original name i.e. "default"
              '\n    at __TURBOPACK__default__export__ (middleware.js:3:15)' +
              '\n  1 |'
          : '\n ⨯ Error: boom' +
              '\n    at default (middleware.js:3:15)' +
              '\n  1 |'
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        '' +
          "\n> 3 |         throw new Error('boom')" +
          '\n    |               ^'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "boom",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:15) @ {default export}
         > 3 |         throw new Error('boom')
             |               ^",
           "stack": [
             "{default export} middleware.js (3:15)",
           ],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "boom",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:15) @ default
         > 3 |         throw new Error('boom')
             |               ^",
           "stack": [
             "default middleware.js (3:15)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "boom",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:15) @ default
         > 3 |         throw new Error('boom')
             |               ^",
           "stack": [
             "default middleware.js (3:15)",
           ],
         }
        `)
      }

      await next.patchFile('middleware.js', `export default function () {}`)

      await assertNoRedbox(browser)
    })
  })

  describe('when middleware contains an unhandled rejection', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { NextResponse } from 'next/server'
      async function throwError() {
        throw new Error('async boom!')
      }
      export default function () {
        throwError()
        return NextResponse.next()
      }`
      )

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')

      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain(
          'unhandledRejection: Error: async boom!'
        )
      })
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? ' ⨯ unhandledRejection:  Error: async boom!' +
              '\n    at throwError (middleware.js:4:15)' +
              // TODO(veil): Sourcemap to original name i.e. "default"
              '\n    at __TURBOPACK__default__export__ (middleware.js:7:9)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
          : '\n ⨯ unhandledRejection:  Error: async boom!' +
              '\n    at throwError (middleware.js:4:15)' +
              '\n    at default (middleware.js:7:9)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        '' +
          "\n> 4 |         throw new Error('async boom!')" +
          '\n    |               ^'
      )
    })

    it('does not render the error', async () => {
      const browser = await next.browser('/')
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when running invalid dynamic code with eval', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { NextResponse } from 'next/server'
      export default function () {
        eval('test')
        return NextResponse.next()
      }`
      )

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')

      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain('Dynamic Code Evaluation')
      })
      if (isTurbopack) {
        // Locally, prefixes the "test is not defined".
        // In CI, it prefixes "Dynamic Code Evaluation".
        expect(stripAnsi(next.cliOutput)).toContain(
          // TODO(veil): Should be sourcemapped
          '\n    at __TURBOPACK__default__export__ (.next/'
        )
      }
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ Error [ReferenceError]: test is not defined' +
              '\n    at eval (middleware.js:4:9)' +
              '\n    at <unknown> (middleware.js:4:9)' +
              // TODO(veil): Should be sourcemapped
              '\n    at __TURBOPACK__default__export__ ('
          : '\n ⨯ Error [ReferenceError]: test is not defined' +
              // TODO(veil): Redundant and not clickable
              '\n    at eval (file://webpack-internal:///(middleware)/./middleware.js)' +
              '\n    at eval (middleware.js:4:9)' +
              '\n    at default (middleware.js:4:9)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? "\n ⚠ DynamicCodeEvaluationWarning: Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime" +
              '\nLearn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation' +
              // TODO(veil): Should be sourcemapped
              '\n    at __TURBOPACK__default__export__ ('
          : "\n ⚠ DynamicCodeEvaluationWarning: Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime" +
              '\nLearn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation' +
              '\n    at default (middleware.js:4:9)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "test is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "middleware.js (4:9) @ eval
         > 4 |         eval('test')
             |         ^",
           "stack": [
             "eval middleware.js (4:9)",
             "<unknown> middleware.js (4:9)",
             "{default export} middleware.js (3:22)",
           ],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "test is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "middleware.js (4:9) @ default
         > 4 |         eval('test')
             |         ^",
           "stack": [
             "<FIXME-file-protocol>",
             "default middleware.js (4:9)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "test is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "middleware.js (4:9) @ eval
         > 4 |         eval('test')
             |         ^",
           "stack": [
             "<FIXME-file-protocol>",
             "eval middleware.js (4:9)",
             "default middleware.js (4:9)",
           ],
         }
        `)
      }

      const lengthOfLogs = next.cliOutput.length
      await next.patchFile('middleware.js', `export default function () {}`)

      retry(() => {
        expect(next.cliOutput.slice(lengthOfLogs)).toContain('GET / 200')
      }, 10000) // middleware rebuild takes a while in CI

      await assertNoRedbox(browser)
    })
  })

  describe('when throwing while loading the module', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { NextResponse } from 'next/server'
      throw new Error('booooom!')
      export default function () {
        return NextResponse.next()
      }`
      )
      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')

      await retry(() => {
        expect(stripAnsi(next.cliOutput)).toContain(`Error: booooom!`)
      })
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ Error: booooom!' +
              // TODO(veil): Should be sourcemapped
              '\n    at module evaluation (middleware.js:3:13)'
          : '\n ⨯ Error: booooom!' +
              // TODO: Should be anonymous method without a method name
              '\n    at <unknown> (middleware.js:3)' +
              // TODO: Should be ignore-listed
              '\n    at eval (middleware.js:3:13)' +
              `\n    at (middleware)/./middleware.js (${getDistDir()}/server/middleware.js:18:1)` +
              '\n    at __webpack_require__ '
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "booooom!",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:13) @ module evaluation
         > 3 |       throw new Error('booooom!')
             |             ^",
           "stack": [
             "module evaluation middleware.js (3:13)",
           ],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "booooom!",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:13) @ eval
         > 3 |       throw new Error('booooom!')
             |             ^",
           "stack": [
             "<FIXME-next-dist-dir>",
             "eval middleware.js (3:13)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "booooom!",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "middleware.js (3:13) @ eval
         > 3 |       throw new Error('booooom!')
             |             ^",
           "stack": [
             "<unknown> middleware.js (3)",
             "eval middleware.js (3:13)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      }

      await next.patchFile('middleware.js', `export default function () {}`)

      await assertNoRedbox(browser)
    })
  })

  describe('when there is an unhandled rejection while loading the module', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { NextResponse } from 'next/server'
      (async function(){
        throw new Error('you shall see me')
      })()

      export default function () {
        return NextResponse.next()
      }`
      )

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')
      await check(
        () => stripAnsi(next.cliOutput),
        new RegExp(`unhandledRejection: Error: you shall see me`, 'm')
      )
      // expect(output).not.toContain(
      //   'webpack-internal:///(middleware)/./middleware.js'
      // )
    })

    it('does not render the error', async () => {
      const browser = await next.browser('/')
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is an unhandled rejection while loading a dependency', () => {
    beforeEach(async () => {
      await next.patchFile(
        'middleware.js',
        `
      import { NextResponse } from 'next/server'
      import './lib/unhandled'

      export default function () {
        return NextResponse.next()
      }`
      )

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')
      const output = stripAnsi(next.cliOutput)
      await check(
        () => stripAnsi(next.cliOutput),
        new RegExp(
          ` uncaughtException: Error: This file asynchronously fails while loading`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('does not render the error', async () => {
      const browser = await next.browser('/')
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is a compilation error from boot', () => {
    beforeEach(async () => {
      await next.patchFile('middleware.js', `export default function () }`)

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.fetch('/')
      await check(async () => {
        expect(next.cliOutput).toContain(`Expected '{', got '}'`)
        expect(
          next.cliOutput.split(`Expected '{', got '}'`).length
        ).toBeGreaterThanOrEqual(2)

        return 'success'
      }, 'success')
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Parsing ecmascript source code failed",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js (1:28)
         Parsing ecmascript source code failed
         > 1 | export default function () }
             |                            ^",
           "stack": [],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  × Module build failed:",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js
           × Module build failed:
           ╰─▶   × Error:   x Expected '{', got '}'
                 │    ,----
                 │  1 | export default function () }
                 │    :                            ^
                 │    \`----
                 │
                 │
                 │ Caused by:
                 │     Syntax Error",
           "stack": [],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  x Expected '{', got '}'",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js
         Error:   x Expected '{', got '}'
            ,----
          1 | export default function () }
            :                            ^
            \`----
         Caused by:
             Syntax Error",
           "stack": [],
         }
        `)
      }

      await next.patchFile('middleware.js', `export default function () {}`)

      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is a compilation error after boot', () => {
    beforeEach(async () => {
      await next.patchFile('middleware.js', `export default function () {}`)

      await next.start()
    })

    it('logs the error correctly', async () => {
      await next.patchFile('middleware.js', `export default function () }`)
      await next.fetch('/')

      await check(() => {
        expect(next.cliOutput).toContain(`Expected '{', got '}'`)
        expect(
          next.cliOutput.split(`Expected '{', got '}'`).length
        ).toBeGreaterThanOrEqual(2)
        return 'success'
      }, 'success')
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')

      await assertNoRedbox(browser)

      await next.patchFile('middleware.js', `export default function () }`)

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Parsing ecmascript source code failed",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js (1:28)
         Parsing ecmascript source code failed
         > 1 | export default function () }
             |                            ^",
           "stack": [],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  × Module build failed:",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js
           × Module build failed:
           ╰─▶   × Error:   x Expected '{', got '}'
                 │    ,----
                 │  1 | export default function () }
                 │    :                            ^
                 │    \`----
                 │
                 │
                 │ Caused by:
                 │     Syntax Error",
           "stack": [],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  x Expected '{', got '}'",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./middleware.js
         Error:   x Expected '{', got '}'
            ,----
          1 | export default function () }
            :                            ^
            \`----
         Caused by:
             Syntax Error",
           "stack": [],
         }
        `)
      }

      await next.patchFile('middleware.js', `export default function () {}`)

      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })
})
