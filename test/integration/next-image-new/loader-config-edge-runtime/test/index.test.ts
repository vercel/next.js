/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app
let browser

function runTests() {
  it('should add "src" to img1 based on the loader config', async () => {
    expect(await browser.elementById('img1').getAttribute('src')).toBe(
      '/logo.png#w:828,q:50'
    )
  })

  it('should add "srcset" to img1 based on the loader config', async () => {
    expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
      '/logo.png#w:640,q:50 1x, /logo.png#w:828,q:50 2x'
    )
  })

  it('should add "src" to img2 based on the loader prop', async () => {
    expect(await browser.elementById('img2').getAttribute('src')).toBe(
      '/logo.png?wid=640&qual=35'
    )
  })

  it('should add "srcset" to img2 based on the loader prop', async () => {
    expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
      '/logo.png?wid=256&qual=35 1x, /logo.png?wid=640&qual=35 2x'
    )
  })
}

describe('Image Loader Config with Edge Runtime', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      browser = await webdriver(appPort, '/')
    })
    afterAll(() => {
      killApp(app)
      if (browser) {
        browser.close()
      }
    })
    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      browser = await webdriver(appPort, '/')
    })
    afterAll(() => {
      killApp(app)
      if (browser) {
        browser.close()
      }
    })
    runTests()
  })
})
