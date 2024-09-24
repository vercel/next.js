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

const appDir = join(__dirname, '..')
const locales = ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en']
let appPort
let app

const runTests = () => {
  it('should rewrite index route correctly', async () => {
    for (const locale of locales) {
      const html = await renderViaHTTP(
        appPort,
        `/${locale === 'en' ? '' : locale}`
      )
      const $ = cheerio.load(html)

      expect(JSON.parse($('#props').text())).toEqual({
        params: {
          slug: ['company', 'about-us'],
        },
        locale,
        hello: 'world',
      })
    }
  })

  it('should handle index rewrite on client correctly', async () => {
    for (const locale of locales) {
      const browser = await webdriver(
        appPort,
        `${locale === 'en' ? '' : `/${locale}`}/hello`
      )

      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
        params: {
          slug: ['hello'],
        },
        locale,
        hello: 'world',
      })
      await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push('/')
      })()`)

      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        const props = JSON.parse(cheerio.load(html)('#props').text())
        assert.deepEqual(props, {
          params: {
            slug: ['company', 'about-us'],
          },
          locale,
          hello: 'world',
        })
        return 'success'
      }, 'success')

      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })
}

describe('Custom routes i18n support index rewrite', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTests(true)
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
