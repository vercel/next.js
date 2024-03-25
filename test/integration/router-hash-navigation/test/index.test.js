/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('scrolls to top when href="/" and url already contains a hash', async () => {
    const browser = await webdriver(appPort, '/#section')
    expect(await browser.eval(() => window.scrollY)).not.toBe(0)
    await browser.elementByCss('#top-link').click()
    expect(await browser.eval(() => window.scrollY)).toBe(0)
    await browser.close()
  })
}

describe('router.isReady', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

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
