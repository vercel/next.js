/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '..')

const didResolveAfterPrefetch = async () => {
  const browser = await webdriver(appPort, '/')
  const text = await browser
    .elementByCss('#prefetch-button')
    .click()
    .waitForElementByCss('#hidden-until-click')
    .text()
  expect(text).toBe('visible')
  await browser.close()
}

describe('Router prefetch', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      it('should not prefetch', async () => {
        const browser = await webdriver(appPort, '/')
        const links = await browser
          .elementByCss('#prefetch-button')
          .click()
          .elementsByCss('link[rel=prefetch]')

        expect(links.length).toBe(0)
        await browser.close()
      })

      it('should resolve prefetch promise', async () => {
        await didResolveAfterPrefetch()
      })
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

      it('should resolve prefetch promise with invalid href', async () => {
        await didResolveAfterPrefetch()
      })
    }
  )
})
