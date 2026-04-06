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

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should reset scroll when navigating via Link (App Router)', async () => {
    const browser = await webdriver(appPort, '/')

    // Scroll down on Page 1
    await browser.eval(() => window.scrollTo(0, 1000))

    const initialScrollY = await browser.eval(() => window.scrollY)
    expect(initialScrollY).toBeGreaterThan(0)

    // Navigate via Link
    await browser.elementByCss('#to-page-2').click()

    // Wait for navigation to complete
    await check(() => browser.eval(() => document.body.innerText), /Page 2/)

    // Check scroll position
    const newScrollY = await browser.eval(() => window.scrollY)

    expect(newScrollY).toBeLessThan(20)
  })
}

describe('scroll restoration on navigation (App Router)', () => {
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
