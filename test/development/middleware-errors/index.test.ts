import {
  assertHasRedbox,
  assertNoRedbox,
  check,
  getRedboxSource,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'

describe('middleware - development errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: { __NEXT_TEST_WITH_DEVTOOL: '1' },
    patchFileDelay: 500,
  })
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
              '\n    at __TURBOPACK__default__export__ (middleware.js:3:14)' +
              '\n  1 |'
          : '\n ⨯ Error: boom' +
              '\n    at default (middleware.js:3:14)' +
              '\n  1 |'
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        '' +
          "\n> 3 |         throw new Error('boom')" +
          '\n    |              ^'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser)
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
              '\n    at throwError (middleware.js:4:14)' +
              // TODO(veil): Sourcemap to original name i.e. "default"
              '\n    at __TURBOPACK__default__export__ (middleware.js:7:8)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
          : '\n ⨯ unhandledRejection:  Error: async boom!' +
              '\n    at throwError (middleware.js:4:14)' +
              '\n    at default (middleware.js:7:8)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        '' +
          "\n> 4 |         throw new Error('async boom!')" +
          '\n    |              ^'
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
              '\n    at eval (middleware.js:4:8)' +
              '\n    at <unknown> (middleware.js:4:8)' +
              // TODO(veil): Should be sourcemapped
              '\n    at __TURBOPACK__default__export__ ('
          : '\n ⨯ Error [ReferenceError]: test is not defined' +
              // TODO(veil): Redundant and not clickable
              '\n    at eval (file://webpack-internal:///(middleware)/./middleware.js)' +
              '\n    at eval (middleware.js:4:8)' +
              '\n    at default (middleware.js:4:8)' +
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
              '\n    at default (middleware.js:4:8)' +
              "\n  2 |       import { NextResponse } from 'next/server'"
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser)

      const lengthOfLogs = next.cliOutput.length

      expect(await getRedboxSource(browser)).toContain(`eval('test')`)
      await next.patchFile('middleware.js', `export default function () {}`)

      retry(() => {
        expect(next.cliOutput.slice(lengthOfLogs)).toContain('✓ Compiled')
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
              '\n    at [project]/middleware.js [middleware] (ecmascript)'
          : '\n ⨯ Error: booooom!' +
              // TODO: Should be anonymous method without a method name
              '\n    at <unknown> (middleware.js:3)' +
              // TODO: Should be ignore-listed
              '\n    at eval (middleware.js:3:12)' +
              '\n    at (middleware)/./middleware.js (.next/server/middleware.js:40:1)' +
              '\n    at __webpack_require__ '
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser)
      const source = await getRedboxSource(browser)
      expect(source).toContain(`throw new Error('booooom!')`)
      expect(source).toContain('middleware.js')
      expect(source).not.toContain('//middleware.js')
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
      await assertHasRedbox(browser)
      expect(
        await browser.elementByCss('#nextjs__container_errors_desc').text()
      ).toEqual('Failed to compile')
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
      await assertHasRedbox(browser)
      await next.patchFile('middleware.js', `export default function () {}`)
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })
})
