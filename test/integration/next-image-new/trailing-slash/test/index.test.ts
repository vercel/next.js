/* eslint-env jest */

import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

describe('Image Component Trailing Slash Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should include trailing slash when trailingSlash is set on config file during next dev', async () => {
      expect.assertions(1)
      let browser

      try {
        browser = await webdriver(appPort, '/')
        const id = 'test1'
        const srcImage = await browser.eval(
          `document.getElementById('${id}').src`
        )
        expect(srcImage).toMatch(
          /\/_next\/image\/\?url=%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&w=828&q=75/
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should include trailing slash when trailingSlash is set on config file during next start', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        const id = 'test1'
        await check(async () => {
          const srcImage = await browser.eval(
            `document.getElementById('${id}').src`
          )
          expect(srcImage).toMatch(
            /\/_next\/image\/\?url=%2F_next%2Fstatic%2Fmedia%2Ftest(.+).jpg&w=828&q=75/
          )
          return 'success'
        }, 'success')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
