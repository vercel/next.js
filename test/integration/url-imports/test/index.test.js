/* eslint-disable no-loop-func */
/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  nextStart,
  killApp,
  renderViaHTTP,
  fetchViaHTTP,
  launchApp,
  getBrowserBodyText,
  check,
  startStaticServer,
  stopApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '../')

;(process.env.TURBOPACK ? describe.skip : describe)(
  `Handle url imports`,
  () => {
    let staticServer
    let staticServerPort
    beforeAll(async () => {
      await fs.remove(join(appDir, 'next.lock'))
      staticServerPort = 12345
      staticServer = await startStaticServer(
        join(appDir, 'source'),
        undefined,
        staticServerPort
      )
    })
    afterAll(async () => {
      await stopApp(staticServer)
    })

    for (const dev of [true, false]) {
      describe(dev ? 'with next dev' : 'with next build', () => {
        let appPort
        let app
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          if (dev) {
            appPort = await findPort()
            app = await launchApp(appDir, appPort)
          } else {
            await nextBuild(appDir)
            appPort = await findPort()
            app = await nextStart(appDir, appPort)
          }
        })
        afterAll(async () => {
          await killApp(app)
        })
        const expectedServer =
          /Hello <!-- -->42<!-- -->\+<!-- -->42<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png/
        const expectedClient = new RegExp(
          expectedServer.source.replace(/<!-- -->/g, '')
        )

        for (const page of ['/static', '/ssr', '/ssg']) {
          it(`should render the ${page} page`, async () => {
            const html = await renderViaHTTP(appPort, page)
            expect(html).toMatch(expectedServer)
          })

          it(`should client-render the ${page} page`, async () => {
            let browser
            try {
              browser = await webdriver(appPort, page)
              await check(() => getBrowserBodyText(browser), expectedClient)
            } finally {
              await browser.close()
            }
          })
        }

        it(`should render a static url image import`, async () => {
          let browser
          try {
            browser = await webdriver(appPort, '/image')
            await browser.waitForElementByCss('#static-image')
            await check(
              () => browser.elementByCss('#static-image').getAttribute('src'),
              /^\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Fvercel\.[0-9a-f]{8}\.png&/
            )
          } finally {
            await browser.close()
          }
        })

        it(`should allow url import in css`, async () => {
          let browser
          try {
            browser = await webdriver(appPort, '/css')
            await browser.waitForElementByCss('#static-css')
            await check(
              () =>
                browser
                  .elementByCss('#static-css')
                  .getComputedCss('background-image'),
              /^url\("http:\/\/localhost:\d+\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png"\)$/
            )
          } finally {
            await browser.close()
          }
        })

        it('should respond on value api', async () => {
          const data = await fetchViaHTTP(appPort, '/api/value').then(
            (res) => res.ok && res.json()
          )

          expect(data).toEqual({ value: 42 })
        })
      })
    }
  }
)
