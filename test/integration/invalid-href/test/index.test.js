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
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 1)

let app
let appPort
const appDir = join(__dirname, '..')

const firstErrorRegex = /Invalid href passed to router: mailto:idk@idk.com.*invalid-href-passed/
const secondErrorRegex = /Invalid href passed to router: .*google\.com.*invalid-href-passed/

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
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('does not show error in production when mailto: is used as href on Link', async () => {
      await noError('/first')
    })

    it('does not show error in production when mailto: is used as href on router.push', async () => {
      await noError('/first?method=push', true)
    })

    it('does not show error in production when mailto: is used as href on router.replace', async () => {
      await noError('/first?method=replace', true)
    })

    it('does not show error in production when https://google.com is used as href on Link', async () => {
      await noError('/second')
    })

    it('does not show error in production when http://google.com is used as href on router.push', async () => {
      await noError('/second?method=push', true)
    })

    it('does not show error in production when https://google.com is used as href on router.replace', async () => {
      await noError('/second?method=replace', true)
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
              'The provided `as` value (/blog/post-1) is incompatible with the `href` value (/[post]). Read more: https://err.sh/vercel/next.js/incompatible-href-as'
            )
          )
        ).toBeTruthy()
      } finally {
        await browser.close()
      }
    })

    it('makes sure that router push with bad links resolve', async () => {
      const browser = await webdriver(appPort, '/third')
      await browser.elementByCss('#click-me').click()
      await browser.waitForElementByCss('#is-done')
    })

    it('makes sure that router replace with bad links resolve', async () => {
      const browser = await webdriver(appPort, '/third?method=replace')
      await browser.elementByCss('#click-me').click()
      await browser.waitForElementByCss('#is-done')
    })
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('shows error when mailto: is used as href on Link', async () => {
      await showsError('/first', firstErrorRegex)
    })

    it('shows error when mailto: is used as href on router.push', async () => {
      await showsError('/first?method=push', firstErrorRegex, true)
    })

    it('shows error when mailto: is used as href on router.replace', async () => {
      await showsError('/first?method=replace', firstErrorRegex, true)
    })

    it('shows error when https://google.com is used as href on Link', async () => {
      await showsError('/second', secondErrorRegex)
    })

    it('shows error when http://google.com is used as href on router.push', async () => {
      await showsError('/second?method=push', secondErrorRegex, true)
    })

    it('shows error when https://google.com is used as href on router.replace', async () => {
      await showsError('/second?method=replace', secondErrorRegex, true)
    })

    it('shows error when dynamic route mismatch is used on Link', async () => {
      await showsError(
        '/dynamic-route-mismatch',
        /The provided `as` value \(\/blog\/post-1\) is incompatible with the `href` value \(\/\[post\]\)/,
        true
      )
    })

    it('does not throw error when dynamic route mismatch is used on Link and params are manually provided', async () => {
      await noError('/dynamic-route-mismatch-manual', true)
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
