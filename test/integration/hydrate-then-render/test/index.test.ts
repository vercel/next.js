/* eslint-env jest */

import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort: number
let server: Awaited<ReturnType<typeof nextStart>>

describe('hydrate/render ordering', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        await nextBuild(appDir, [], {})
        server = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(server))

      it('correctly measures hydrate followed by render', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#to-other')
        await browser.elementByCss('#to-other').click()
        await browser.waitForElementByCss('#on-other', { state: 'attached' })

        const beacons = (await browser.eval('window.__BEACONS'))
          .map(([, value]) => Object.fromEntries(new URLSearchParams(value)))
          .filter((p) => p.label === 'custom')
        expect(beacons).toMatchObject([
          { name: 'Next.js-hydration' },
          { name: 'Next.js-render' },
          { name: 'Next.js-route-change-to-render' },
        ])

        await browser.close()
      })
    }
  )
})
