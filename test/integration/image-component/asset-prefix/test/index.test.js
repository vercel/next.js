/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60)

const appDir = join(__dirname, '../')

let appPort
let app

describe('Image Component assetPrefix Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should include assetPrefix when placeholder=blur during next dev', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').style['background-image']`
        )
        expect(bgImage).toMatch(
          /\/_next\/image\?url=https%3A%2F%2Fexample.com%2Fpre%2F_next%2Fstatic%2Fimage%2Fpublic%2Ftest(.+).jpg&w=8&q=70/
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should use base64 data url with placeholder=blur during next start', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        const id = 'test1'
        const bgImage = await browser.eval(
          `document.getElementById('${id}').style['background-image']`
        )
        expect(bgImage).toMatch('data:image/jpeg;base64')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
