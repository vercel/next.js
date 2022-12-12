import {
  check,
  fetchViaHTTP,
  File,
  findPort,
  getRedboxSource,
  hasRedbox,
  killApp,
  launchApp,
} from 'next-test-utils'
import { join } from 'path'
import stripAnsi from 'strip-ansi'
import webdriver from 'next-webdriver'

const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
  middleware: new File(join(__dirname, '../middleware.js')),
  page: new File(join(__dirname, '../pages/index.js')),
}

describe('Middleware development errors', () => {
  beforeEach(async () => {
    context.logs = { output: '', stdout: '', stderr: '' }
    context.appPort = await findPort()
    context.app = await launchApp(context.appDir, context.appPort, {
      env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
      onStdout(msg) {
        context.logs.output += msg
        context.logs.stdout += msg
      },
      onStderr(msg) {
        context.logs.output += msg
        context.logs.stderr += msg
      },
    })
  })

  afterEach(() => {
    context.middleware.restore()
    context.page.restore()
    if (context.app) {
      killApp(context.app)
    }
  })

  describe('when middleware throws synchronously', () => {
    beforeEach(() => {
      context.middleware.write(`
      export default function () {
        throw new Error('boom')
      }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - middleware.js \\(\\d+:\\d+\\) @ Object.default \\[as handler\\]\nerror - boom`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      context.middleware.write(`export default function () {}`)
      await hasRedbox(browser, false)
    })
  })

  describe('when middleware contains an unhandled rejection', () => {
    beforeEach(() => {
      context.middleware.write(`
      import { NextResponse } from 'next/server'
      async function throwError() {
        throw new Error('async boom!')
      }
      export default function () {
        throwError()
        return NextResponse.next()
      }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - middleware.js \\(\\d+:\\d+\\) @ throwError\nerror - unhandledRejection: async boom!`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('does not render the error', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when running invalid dynamic code with eval', () => {
    beforeEach(() => {
      context.middleware.write(`
      import { NextResponse } from 'next/server'
      export default function () {
        eval('test')
        return NextResponse.next()
      }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - middleware.js \\(\\d+:\\d+\\) @ eval\nerror - test is not defined`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toContain(`eval('test')`)
      context.middleware.write(`export default function () {}`)
      await hasRedbox(browser, false)
    })
  })

  describe('when throwing while loading the module', () => {
    beforeEach(() => {
      context.middleware.write(`
      import { NextResponse } from 'next/server'
                    throw new Error('booooom!')
                    export default function () {
                      return NextResponse.next()
                    }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - middleware.js \\(\\d+:\\d+\\) @ <unknown>\nerror - booooom!`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(await getRedboxSource(browser)).toContain(
        `throw new Error('booooom!')`
      )
      context.middleware.write(`export default function () {}`)
      await hasRedbox(browser, false)
    })
  })

  describe('when there is an unhandled rejection while loading the module', () => {
    beforeEach(() => {
      context.middleware.write(`
      import { NextResponse } from 'next/server'
                (async function(){
                  throw new Error('you shall see me')
                })()

                export default function () {
                  return NextResponse.next()
                }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - middleware.js \\(\\d+:\\d+\\) @ eval\nerror - unhandledRejection: you shall see me`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('does not render the error', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is an unhandled rejection while loading a dependency', () => {
    beforeEach(() => {
      context.middleware.write(`
      import { NextResponse } from 'next/server'
                import './lib/unhandled'

                export default function () {
                  return NextResponse.next()
                }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      const output = stripAnsi(context.logs.output)
      expect(output).toMatch(
        new RegExp(
          `error - lib/unhandled.js \\(\\d+:\\d+\\) @ Timeout.eval \\[as _onTimeout\\]\nerror - uncaughtException: This file asynchronously fails while loading`,
          'm'
        )
      )
      expect(output).not.toContain(
        'webpack-internal:///(middleware)/./middleware.js'
      )
    })

    it('does not render the error', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is a compilation error from boot', () => {
    beforeEach(() => {
      context.middleware.write(`export default function () }`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      expect(context.logs.output).toContain(`Expected '{', got '}'`)
      expect(context.logs.output.split(`Expected '{', got '}'`).length).toEqual(
        2
      )
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(
        await browser
          .elementByCss('#nextjs__container_build_error_label')
          .text()
      ).toEqual('Failed to compile')
      context.middleware.write(`export default function () {}`)
      await hasRedbox(browser, false)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })

  describe('when there is a compilation error after boot', () => {
    beforeEach(() => {
      context.middleware.write(`export default function () {}`)
    })

    it('logs the error correctly', async () => {
      await fetchViaHTTP(context.appPort, '/')
      context.middleware.write(`export default function () }`)
      await check(() => {
        expect(context.logs.output).toContain(`Expected '{', got '}'`)
        expect(
          context.logs.output.split(`Expected '{', got '}'`).length
        ).toEqual(2)
        return 'success'
      }, 'success')
    })

    it('renders the error correctly and recovers', async () => {
      const browser = await webdriver(context.appPort, '/')
      expect(await hasRedbox(browser, false)).toBe(false)
      context.middleware.write(`export default function () }`)
      expect(await hasRedbox(browser, true)).toBe(true)
      context.middleware.write(`export default function () {}`)
      expect(await hasRedbox(browser, false)).toBe(false)
      expect(await browser.elementByCss('#page-title')).toBeTruthy()
    })
  })
})
