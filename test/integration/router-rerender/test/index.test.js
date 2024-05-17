/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  describe('with middleware', () => {
    it('should not trigger unnecessary rerenders when middleware is used', async () => {
      const browser = await webdriver(appPort, '/')
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(await browser.eval('window.__renders')).toEqual([undefined])
    })
  })

  describe('with rewrites', () => {
    // TODO: Figure out the `isReady` issue.
    it.skip('should not trigger unnecessary rerenders when rewrites are used', async () => {})
    it.skip('should rerender with the correct query parameter if present with rewrites', async () => {})
  })
}

describe('router rerender', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
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

      runTests()
    }
  )
})
