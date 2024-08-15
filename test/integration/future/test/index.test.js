/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextBuild,
  nextStart,
  killApp,
  findPort,
  renderViaHTTP,
} from 'next-test-utils'

let appDir = join(__dirname, '../')
let appPort
let app

describe('excludeDefaultMomentLocales', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        await nextBuild(appDir)
        app = await nextStart(appDir, appPort)
        await renderViaHTTP(appPort, '/')
      })
      afterAll(() => killApp(app))

      it('should load momentjs', async () => {
        const browser = await webdriver(appPort, '/')
        expect(await browser.elementByCss('h1').text()).toMatch(/current time/i)
        const locales = await browser.eval('moment.locales()')
        expect(locales).toEqual(['en'])
        expect(locales.length).toBe(1)
        await browser.close()
      })
    }
  )
})
