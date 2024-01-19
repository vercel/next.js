/* eslint-env jest */

import {
  findPort,
  getRedboxHeader,
  hasRedbox,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  waitFor,
  check,
  fetchViaHTTP,
} from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { join } from 'path'

let app
let appPort
const appDir = join(__dirname, '..')

// This test doesn't seem to benefit from retries, let's disable them until the test gets fixed
// to prevent long running times
jest.retryTimes(0)

const showsError = async (pathname, regex, click = false, isWarn = false) => {
  const browser = await webdriver(appPort, pathname)
  try {
    // wait for page to be built and navigated to
    await browser.waitForElementByCss('#click-me')
    if (isWarn) {
      await browser.eval(`(function() {
        window.warnLogs = []
        var origWarn = window.console.warn
        window.console.warn = (...args) => {
          window.warnLogs.push(args.join(' '))
          origWarn.apply(window.console, args)
        }
      })()`)
    }
    if (click) {
      await browser.elementByCss('#click-me').click()
      await waitFor(500)
    }
    if (isWarn) {
      await check(async () => {
        const warnLogs = await browser.eval('window.warnLogs')
        return warnLogs.join('\n')
      }, regex)
    } else {
      expect(await hasRedbox(browser)).toBe(true)
      const errorContent = await getRedboxHeader(browser)
      expect(errorContent).toMatch(regex)
    }
  } finally {
    await browser.close()
  }
}

const noError = async (pathname, click = false) => {
  const browser = await webdriver(appPort, '/')
  try {
    await browser.eval(`(function() {
      window.caughtErrors = []
      window.addEventListener('error', function (error) {
        window.caughtErrors.push(error.message || 1)
      })
      window.addEventListener('unhandledrejection', function (error) {
        window.caughtErrors.push(error.message || 1)
      })
      window.next.router.replace('${pathname}')
    })()`)
    await browser.waitForElementByCss('#click-me')
    if (click) {
      await browser.elementByCss('#click-me').click()
      await waitFor(500)
    }
    const caughtErrors = await browser.eval(`window.caughtErrors`)
    expect(caughtErrors).toHaveLength(0)
  } finally {
    await browser.close()
  }
}

describe('Invalid hrefs', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('does not show error in production when mailto: is used as href on Link', async () => {
      await noError('/first')
    })

    it('does not show error in production when https://google.com is used as href on Link', async () => {
      await noError('/second')
    })

    it('does not show error when internal href is used with external as', async () => {
      await noError('/invalid-relative', true)
    })

    it('shows error when dynamic route mismatch is used on Link', async () => {
      const browser = await webdriver(appPort, '/dynamic-route-mismatch')
      try {
        await browser.eval(`(function() {
          window.caughtErrors = []
          window.addEventListener('unhandledrejection', (error) => {
            window.caughtErrors.push(error.reason.message)
          })
        })()`)
        await browser.elementByCss('a').click()
        await waitFor(500)
        const errors = await browser.eval('window.caughtErrors')
        expect(
          errors.find((err) =>
            err.includes(
              'The provided `as` value (/blog/post-1) is incompatible with the `href` value (/[post]). Read more: https://nextjs.org/docs/messages/incompatible-href-as'
            )
          )
        ).toBeTruthy()
      } finally {
        await browser.close()
      }
    })

    it("doesn't fail on invalid url", async () => {
      await noError('/third')
    })

    it('renders a link with invalid href', async () => {
      const res = await fetchViaHTTP(appPort, '/third')
      const $ = cheerio.load(await res.text())
      expect($('#click-me').attr('href')).toBe('https://')
    })

    it('renders a link with mailto: href', async () => {
      const res = await fetchViaHTTP(appPort, '/first')
      const $ = cheerio.load(await res.text())
      expect($('#click-me').attr('href')).toBe('mailto:idk@idk.com')
    })
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('does not show error when mailto: is used as href on Link', async () => {
      await noError('/first')
    })

    it('does not show error when https://google.com is used as href on Link', async () => {
      await noError('/second')
    })

    it('shows error when dynamic route mismatch is used on Link', async () => {
      await showsError(
        '/dynamic-route-mismatch',
        /The provided `as` value \(\/blog\/post-1\) is incompatible with the `href` value \(\/\[post\]\)/,
        true
      )
    })

    it('shows error when internal href is used with external as', async () => {
      await showsError(
        '/invalid-relative',
        /Invalid href: "\/second" and as: "mailto:hello@example\.com", received relative href and external as/,
        true
      )
    })

    it('does not throw error when dynamic route mismatch is used on Link and params are manually provided', async () => {
      await noError('/dynamic-route-mismatch-manual', true)
    })

    it("doesn't fail on invalid url", async () => {
      await noError('/third')
    })

    it('shows warning when dynamic route mismatch is used on Link', async () => {
      await showsError(
        '/dynamic-route-mismatch',
        /Mismatching `as` and `href` failed to manually provide the params: post in the `href`'s `query`/,
        true,
        true
      )
    })
  })
})
