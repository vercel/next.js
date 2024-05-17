/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  retry,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

const runTests = () => {
  it('should restore the scroll position on navigating forward', async () => {
    const browser = await webdriver(appPort, '/another')
    await browser.elementByCss('#to-index').click()

    await retry(async () => {
      expect(
        await browser.eval(() => document.documentElement.innerHTML)
      ).toMatch(/the end/)
    })

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

    await browser.eval(() => window.history.back())

    await retry(async () => {
      expect(
        await browser.eval(() => document.documentElement.innerHTML)
      ).toMatch(/hi from another/)
    })

    await browser.eval(() => (window.didHydrate = false))
    await browser.eval(() => window.history.forward())

    await retry(async () => {
      expect(await browser.eval(() => window.didHydrate)).toMatch({
        test(content) {
          return content
        },
      })
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
}

describe('Scroll Forward Restoration Support', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
