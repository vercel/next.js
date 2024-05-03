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
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '../')

for (const dev of [false, true]) {
  ;(process.env.TURBOPACK && !dev ? describe.skip : describe)(
    `Handle new URL asset references in next ${dev ? 'dev' : 'build'}`,
    () => {
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
      afterAll(() => killApp(app))

      const expectedServer =
        /Hello <!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png<!-- -->\+<!-- -->\/_next\/static\/media\/vercel\.[0-9a-f]{8}\.png/
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

      it('should respond on size api', async () => {
        const data = await fetchViaHTTP(appPort, '/api/size').then(
          (res) => res.ok && res.json()
        )

        expect(data).toEqual({ size: 30079 })
      })

      it('should respond on basename api', async () => {
        const data = await fetchViaHTTP(appPort, '/api/basename').then(
          (res) => res.ok && res.json()
        )

        expect(data).toEqual({
          basename: expect.stringMatching(/^vercel\.[0-9a-f]{8}\.png$/),
        })
      })
    }
  )
}
