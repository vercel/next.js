/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let appPort
let app

const runTests = () => {
  it('should restore the scroll position on navigating back', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval(() =>
      document.querySelector('#to-another').scrollIntoView()
    )
    const scrollRestoration = await browser.eval(
      () => window.history.scrollRestoration
    )

    expect(scrollRestoration).toBe('manual')

    const scrollX = Math.floor(await browser.eval(() => window.scrollX))
    const scrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(scrollX).not.toBe(0)
    expect(scrollY).not.toBe(0)

    await browser.eval(() => window.next.router.push('/another'))

    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /hi from another/
    )
    await browser.eval(() => (window.didHydrate = false))

    await browser.eval(() => window.history.back())
    await check(() => browser.eval(() => window.didHydrate), {
      test(content) {
        return content
      },
    })

    const newScrollX = Math.floor(await browser.eval(() => window.scrollX))
    const newScrollY = Math.floor(await browser.eval(() => window.scrollY))

    console.log({
      scrollX,
      scrollY,
      newScrollX,
      newScrollY,
    })

    expect(scrollX).toBe(newScrollX)
    expect(scrollY).toBe(newScrollY)
  })

  it('should scroll to the restored position on same-page navigation back with hash links', async () => {
    const browser = await webdriver(appPort, '/hash-changes')

    await browser.eval(() =>
      document.querySelector('#scroll-to-item-100').scrollIntoView()
    )
    const scrollPosition = await browser.eval('window.pageYOffset')

    const scrollPositionItem100 = await browser
      .elementByCss('#scroll-to-item-100')
      .click()
      .eval('window.pageYOffset')

    expect(scrollPositionItem100).toBe(1790)

    await browser.eval(() => window.history.back())
    const newScrollPosition = await browser.eval('window.pageYOffset')

    expect(newScrollPosition).toBe(scrollPosition)
  })
}

describe('Scroll Restoration Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
