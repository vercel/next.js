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
      // TODO: assert on full, ignore-listed stack
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ middleware.js (3:15) @ __TURBOPACK__default__export__' +
              '\n ⨯ Error: boom' +
              '\n    at __TURBOPACK__default__export__ (./middleware.js:3:15)'
          : '\n ⨯ middleware.js (3:15) @ default' +
              '\n ⨯ boom' +
              '\n  1 |' +
              '\n  2 |       export default function () {' +
              "\n> 3 |         throw new Error('boom')" +
              '\n    |               ^'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser)
      await next.patchFile('middleware.js', `export default function () {}`)
      await assertHasRedbox(browser)
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
      // TODO: assert on full, ignore-listed stack
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? 'unhandledRejection: Error: async boom!\n    at throwError ('
          : 'unhandledRejection: Error: async boom!' +
              '\n    at throwError (webpack-internal:///(middleware)/./middleware.js:8:11)' +
              '\n    at __WEBPACK_DEFAULT_EXPORT__ (webpack-internal:///(middleware)/./middleware.js:11:5)'
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
      // TODO: assert on full, ignore-listed stack
      if (isTurbopack) {
        // Locally, prefixes the "test is not defined".
        // In CI, it prefixes "Dynamic Code Evaluation".
        expect(stripAnsi(next.cliOutput)).toContain(
          '\n ⚠ middleware.js (3:22) @ __TURBOPACK__default__export__' +
            '\n ⨯ middleware.js (4:9) @ eval'
        )
      }
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ Error: test is not defined' +
              '\n    at eval (./middleware.js:4:9)' +
              '\n    at <unknown> (./middleware.js:4:9'
          : '\n ⨯ Error [ReferenceError]: test is not defined' +
              '\n    at eval (file://webpack-internal:///(middleware)/./middleware.js)' +
              '\n    at eval (webpack://_N_E/middleware.js?3bcb:4:8)'
      )
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? "\n ⚠ Error: Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime" +
              '\nLearn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation' +
              '\n    at __TURBOPACK__default__export__ (./middleware.js:3:22)'
          : '\n ⚠ middleware.js (4:9) @ eval' +
              "\n ⚠ Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime" +
              '\nLearn More: https://nextjs.org/docs/messages/edge-dynamic-code-evaluation'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser)
      expect(await getRedboxSource(browser)).toContain(`eval('test')`)
      await next.patchFile('middleware.js', `export default function () {}`)
      await assertHasRedbox(browser)
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
      // TODO: assert on full, ignore-listed stack
      expect(stripAnsi(next.cliOutput)).toContain(
        isTurbopack
          ? '\n ⨯ middleware.js (3:13) @ [project]/middleware.js [middleware] (ecmascript)' +
              '\n ⨯ Error: booooom!' +
              '\n    at <unknown> ([project]/middleware.js [middleware] (ecmascript) (./middleware.js:3:13)'
          : '\n ⨯ Error: booooom!' +
              '\n    at <unknown> (webpack://_N_E/middleware.js'
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
      await assertHasRedbox(browser)
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
      await assertHasRedbox(browser)
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
