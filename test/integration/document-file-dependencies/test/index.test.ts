/* eslint-env jest */

import { join } from 'path'
import { findPort, killApp, nextBuild, nextStart } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '..')

let appPort
let app

describe('File Dependencies', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        await nextBuild(appDir)
        app = await nextStart(appDir, appPort)
      })

      afterAll(() => killApp(app))

      it('should apply styles defined in global and module css files in a standard page.', async () => {
        const browser = await webdriver(appPort, '/')
        await browser.waitForElementByCss('#index')

        const styles = await browser.eval(() => {
          const computed = getComputedStyle(document.getElementById('index'))
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
          }
        })

        expect(styles).toEqual({
          color: 'rgb(0, 0, 255)',
          backgroundColor: 'rgb(200, 200, 200)',
        })
      })

      it('should apply styles defined in global and module css files in 404 page', async () => {
        const browser = await webdriver(appPort, '/__not_found__')
        await browser.waitForElementByCss('#notFound')

        const styles = await browser.eval(() => {
          const computed = getComputedStyle(document.getElementById('notFound'))
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
          }
        })

        expect(styles).toEqual({
          color: 'rgb(0, 255, 0)',
          backgroundColor: 'rgb(200, 200, 200)',
        })
      })

      it('should apply styles defined in global and module css files in error page', async () => {
        const browser = await webdriver(appPort, '/error-trigger')
        await browser.waitForElementByCss('#error')

        const styles = await browser.eval(() => {
          const computed = getComputedStyle(document.getElementById('error'))
          return {
            color: computed.color,
            backgroundColor: computed.backgroundColor,
          }
        })

        expect(styles).toEqual({
          color: 'rgb(255, 0, 0)',
          backgroundColor: 'rgb(200, 200, 200)',
        })
      })
    }
  )
})
