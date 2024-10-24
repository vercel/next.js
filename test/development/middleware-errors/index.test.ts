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
      const output = stripAnsi(next.cliOutput)
      await check(() => {
        if (isTurbopack) {
          expect(stripAnsi(next.cliOutput)).toMatch(
            /middleware.js \(\d+:\d+\) @ __TURBOPACK__default__export__/
          )
        } else {
          expect(stripAnsi(next.cliOutput)).toMatch(
            /middleware.js \(\d+:\d+\) @ default/
          )
        }

        expect(stripAnsi(next.cliOutput)).toMatch(/boom/)
        return 'success'
      }, 'success')
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
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
      await check(
        () => stripAnsi(next.cliOutput),
        new RegExp(`unhandledRejection: Error: async boom!`, 'm')
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
      // const output = stripAnsi(next.cliOutput)
      await check(() => {
        expect(stripAnsi(next.cliOutput)).toMatch(
          /middleware.js \(\d+:\d+\) @ eval/
        )
        expect(stripAnsi(next.cliOutput)).toMatch(/test is not defined/)
        return 'success'
      }, 'success')
      // expect(output).not.toContain(
      //   'webpack-internal:///(middleware)/./middleware.js'
      // )
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
        expect(next.cliOutput).toContain(`Error: booooom!`)
      })

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
