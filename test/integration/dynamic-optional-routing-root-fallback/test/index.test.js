/* eslint-env jest */

import fsp from 'fs/promises'
import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should render optional catch-all top-level route with no segments', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await browser.waitForElementByCss('#success')
      await check(() => browser.elementByCss('#success').text(), /yay/)
    } finally {
      await browser.close()
    }
  })

  it('should render optional catch-all top-level route with one segment', async () => {
    const browser = await webdriver(appPort, '/one')
    try {
      await browser.waitForElementByCss('#success')
      await check(() => browser.elementByCss('#success').text(), /one/)
    } finally {
      await browser.close()
    }
  })

  it('should render optional catch-all top-level route with two segments', async () => {
    const browser = await webdriver(appPort, '/one/two')
    try {
      await browser.waitForElementByCss('#success')
      await check(() => browser.elementByCss('#success').text(), /one,two/)
    } finally {
      await browser.close()
    }
  })
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Optional Routing Root Fallback', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })

      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })

      const curConfig = await fsp.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fsp.writeFile(nextConfig, `module.exports = {}`)
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
