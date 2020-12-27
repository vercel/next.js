/* eslint-env jest */

import { join } from 'path'
import assert from 'assert'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should rewrite index route correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      params: {
        slug: ['company', 'about-us'],
      },
      hello: 'world',
    })
  })

  it('should handle index rewrite on client correctly', async () => {
    const browser = await webdriver(appPort, '/hello')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {
        slug: ['hello'],
      },
      hello: 'world',
    })
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/')
    })()`)

    await check(async () => {
      assert.deepEqual(
        JSON.parse(await browser.elementByCss('#props').text()),
        {
          params: {
            slug: ['company', 'about-us'],
          },
          hello: 'world',
        }
      )
      return 'success'
    }, 'success')
  })
}

describe('Custom routes i18n', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
