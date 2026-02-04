/* eslint-env jest */

import fs from 'fs-extra'
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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))

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
        await fs.remove(join(appDir, '.next'))

        const curConfig = await fs.readFile(nextConfig, 'utf8')

        if (curConfig.includes('target')) {
          await fs.writeFile(nextConfig, `module.exports = {}`)
        }
        await nextBuild(appDir)

        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
