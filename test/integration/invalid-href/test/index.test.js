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
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
let app
let appPort
const appDir = join(__dirname, '..')

const firstErrorRegex = /Invalid href passed to router: mailto:idk@idk.com.*invalid-href-passed/
const secondErrorRegex = /Invalid href passed to router: .*google\.com.*invalid-href-passed/

const showsError = async (pathname, regex, click = false) => {
  const browser = await webdriver(appPort, pathname)
  if (click) {
    await browser.elementByCss('a').click()
  }
  const errorContent = await getReactErrorOverlayContent(browser)
  expect(errorContent).toMatch(regex)
  await browser.close()
}

const noError = async (pathname, click = false) => {
  const browser = await webdriver(appPort, '/')
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
  await waitFor(250)
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
        /The provided `as` value is incompatible with the `href` value/,
        true
      )
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
  })
})
