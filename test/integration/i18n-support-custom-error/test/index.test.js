/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const locales = ['en', 'fr', 'de', 'it']
let appPort
let app

const runTests = () => {
  it('should localized [slug] routes render correctly', async () => {
    for (const locale of locales) {
      const browser = await webdriver(
        appPort,
        `${locale === 'en' ? '' : `/${locale}`}/my-custom-path-1`
      )

      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
        locale,
        params: {
          slug: 'my-custom-path-1',
        },
        title: 'my-custom-path-1',
      })
    }
  })

  it('handle custom http status maintaining locale props in custom _error page', async () => {
    for (const locale of locales) {
      const browser = await webdriver(
        appPort,
        `${locale === 'en' ? '' : `/${locale}`}/my-custom-gone-path`
      )

      expect(
        JSON.parse(await browser.elementByCss('#error-props').text())
      ).toEqual(
        expect.objectContaining({
          locale,
          statusCode: 410,
        })
      )
    }
  })

  it('handle default http status maintaining locale props in custom _error page', async () => {
    for (const locale of locales) {
      const browser = await webdriver(
        appPort,
        `${locale === 'en' ? '' : `/${locale}`}/my-custom-gone-path/other-path`
      )

      expect(
        JSON.parse(await browser.elementByCss('#error-props').text())
      ).toEqual(
        expect.objectContaining({
          locale,
          statusCode: 404,
        })
      )
    }
  })

  it('should work also on client side routing', async () => {
    for (const locale of locales) {
      const browser = await webdriver(
        appPort,
        `${locale === 'en' ? '' : `/${locale}`}/my-custom-path-1`
      )

      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual(
        expect.objectContaining({
          locale,
          params: { slug: 'my-custom-path-1' },
          title: 'my-custom-path-1',
        })
      )

      await browser.eval('window.next.router.push("/my-custom-path-2")')

      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual(
        expect.objectContaining({
          locale,
          params: { slug: 'my-custom-path-2' },
          title: 'my-custom-path-2',
        })
      )

      await browser.eval('window.next.router.push("/my-custom-gone-path")')

      expect(
        JSON.parse(await browser.elementByCss('#error-props').text())
      ).toEqual(
        expect.objectContaining({
          locale,
        })
      )
    }
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
