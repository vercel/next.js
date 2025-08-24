/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  retry,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

const clientNavigation = (context, isProd = false) => {
  describe('Client Navigation 404', () => {
    describe('should show 404 upon client replacestate', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/asd')
        const serverCode = await browser
          .waitForElementByCss('#errorStatusCode')
          .text()
        await browser.waitForElementByCss('#errorGoHome').click()
        await browser.waitForElementByCss('#hellom8').back()
        const clientCode = await browser
          .waitForElementByCss('#errorStatusCode')
          .text()

        expect({ serverCode, clientCode }).toMatchObject({
          serverCode: '404',
          clientCode: '404',
        })
        await browser.close()
      })
    })

    it('should hard navigate to URL on failing to load bundle', async () => {
      const browser = await webdriver(context.appPort, '/invalid-link')
      await browser.eval(() => (window.beforeNav = 'hi'))
      await browser.elementByCss('#to-nonexistent').click()
      await check(() => browser.elementByCss('#errorStatusCode').text(), /404/)
      expect(await browser.eval(() => window.beforeNav)).not.toBe('hi')
    })

    if (isProd) {
      it('should hard navigate to URL on failing to load missing bundle', async () => {
        let chunk = getClientBuildManifestLoaderChunkUrlPath(appDir, '/missing')
        const browser = await webdriver(context.appPort, '/to-missing-link', {
          beforePageLoad(page) {
            page.route('**/' + chunk, (route) => {
              route.abort('internetdisconnected')
            })
          },
        })
        await browser.eval(() => (window.beforeNav = 'hi'))
        await browser.elementByCss('#to-missing').click()

        await retry(async () => {
          expect(await browser.url()).toContain('/missing')
        })
        expect(await browser.elementByCss('#missing').text()).toBe('poof')
        expect(await browser.eval(() => window.beforeNav)).not.toBe('hi')
      })
    }
  })
}

const context = {}
const appDir = join(__dirname, '../')

const runTests = (isProd = false) => {
  clientNavigation(context, isProd)
}

describe('Client 404', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        context.appPort = await findPort()
        context.server = await launchApp(appDir, context.appPort)

        // pre-build page at the start
        await renderViaHTTP(context.appPort, '/')
      })
      afterAll(() => killApp(context.server))

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        context.appPort = await findPort()
        context.server = await nextStart(appDir, context.appPort)
      })
      afterAll(() => killApp(context.server))

      runTests(true)
    }
  )
})
