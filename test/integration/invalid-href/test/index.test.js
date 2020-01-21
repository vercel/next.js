/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  getReactErrorOverlayContent,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
let app
let appPort
const appDir = join(__dirname, '..')

const firstErrorRegex = /Invalid href passed to router: mailto:idk@idk.com.*invalid-href-passed/
const secondErrorRegex = /Invalid href passed to router: .*google\.com.*invalid-href-passed/

const showsError = async (
  pathname,
  regex,
  click = false,
  isWarn = false,
  cb
) => {
  const browser = await webdriver(appPort, pathname)
  if (isWarn) {
    await browser.eval(`(function() {
      window.warnLogs = []
      var origWarn = window.console.warn
      window.console.warn = function() {
        var warnStr = ''
        for (var i = 0; i < arguments.length; i++) {
          if (i > 0) warnStr += ' ';
          warnStr += arguments[i]
        }
        window.warnLogs.push(warnStr)
        origWarn.apply(undefined, arguments)
      }
    })()`)
  }

  if (click) {
    await browser.elementByCss('a').click()
  }
  if (isWarn) {
    await waitFor(2000)
    const warnLogs = await browser.eval('window.warnLogs')
    console.log(warnLogs)
    expect(warnLogs.some(log => log.match(regex))).toBe(true)
  } else {
    const errorContent = await getReactErrorOverlayContent(browser)
    expect(errorContent).toMatch(regex)
  }

  if (cb) await cb(browser)

  await browser.close()
}

const noError = async (pathname, click = false) => {
  const browser = await webdriver(appPort, '/')
  await waitFor(2000)
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
  // wait for page to be built and navigated to
  await waitFor(3000)
  if (click) {
    await browser.elementByCss('a').click()
  }
  const numErrors = await browser.eval(`window.caughtErrors.length`)
  expect(numErrors).toBe(0)
  await browser.close()
}

describe('Invalid hrefs', () => {
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
      await showsError(
        '/dynamic-route-mismatch',
        /Mismatching `as` and `href` failed to manually provide the params: post in the `href`'s `query`/,
        true,
        true
      )
    })

    it('does not throw error when dynamic route mismatch is used on Link and params are manually provided', async () => {
      await noError('/dynamic-route-mismatch-manual', true)
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp())

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
        errors.find(err =>
          err.includes(
            'The provided `as` value (/blog/post-1) is incompatible with the `href` value (/[post]). Read more: https://err.sh/zeit/next.js/incompatible-href-as'
          )
        )
      ).toBeTruthy()
    })
  })
})
