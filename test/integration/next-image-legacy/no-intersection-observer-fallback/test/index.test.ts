import {
  check,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser

describe('Image Component No IntersectionObserver test', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    describe('SSR Lazy Loading Tests', () => {
      it('should automatically load images if observer does not exist', async () => {
        browser = await webdriver(appPort, '/no-observer')

        // Make sure the IntersectionObserver is mocked to null during the test
        await check(() => {
          return browser.eval('IntersectionObserver')
        }, /null/)

        expect(
          await browser.elementById('lazy-no-observer').getAttribute('src')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
        )
        expect(
          await browser.elementById('lazy-no-observer').getAttribute('srcset')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
        )
      })
    })

    describe('Client-side Lazy Loading Tests', () => {
      it('should automatically load images if observer does not exist', async () => {
        browser = await webdriver(appPort, '/')

        // Make sure the IntersectionObserver is mocked to null during the test
        await check(() => {
          return browser.eval('IntersectionObserver')
        }, /null/)

        await browser.waitForElementByCss('#link-no-observer').click()

        await waitFor(1000)
        expect(
          await browser.elementById('lazy-no-observer').getAttribute('src')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
        )
        expect(
          await browser.elementById('lazy-no-observer').getAttribute('srcset')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
        )
      })
    })
  })
})
