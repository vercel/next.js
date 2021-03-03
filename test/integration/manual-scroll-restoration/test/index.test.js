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
  it('should not reset the scroll position on navigating back and forward', async () => {
    const browser = await webdriver(appPort, '/')
    const scrollRestoration = await browser.eval(
      () => window.history.scrollRestoration
    )

    // Make sure browser scroll restoration is disabled
    expect(scrollRestoration).toBe('manual')

    // scroll on /
    await browser.eval(() =>
      document.querySelector('#to-another').scrollIntoView()
    )

    // go to /another
    await browser.eval(() => window.next.router.push('/another'))
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /hi from another/
    )

    let anotherScrollX = Math.floor(await browser.eval(() => window.scrollX))
    let anotherScrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(anotherScrollX).toBe(0)
    expect(anotherScrollY).toBe(0)

    // scroll on /another
    await browser.eval(() =>
      document.querySelector('#to-index').scrollIntoView()
    )

    anotherScrollX = Math.floor(await browser.eval(() => window.scrollX))
    anotherScrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(anotherScrollX).not.toBe(0)
    expect(anotherScrollY).not.toBe(0)

    // back to /
    await browser.eval(() => window.history.back())

    // it should not change the scroll position
    let scrollX = Math.floor(await browser.eval(() => window.scrollX))
    let scrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(scrollX).toBe(anotherScrollX)
    expect(scrollY).toBe(anotherScrollY)

    // scroll on /
    await browser.eval(() =>
      document.querySelector('#to-another').scrollIntoView()
    )
    scrollX = Math.floor(await browser.eval(() => window.scrollX))
    scrollY = Math.floor(await browser.eval(() => window.scrollY))

    // forward
    await browser.eval(() => window.history.forward())

    // it should not change the scroll position
    anotherScrollX = Math.floor(await browser.eval(() => window.scrollX))
    anotherScrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(scrollX).toBe(anotherScrollX)
    expect(scrollY).toBe(anotherScrollY)
  })
}

describe('Manual Scroll Restoration', () => {
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
