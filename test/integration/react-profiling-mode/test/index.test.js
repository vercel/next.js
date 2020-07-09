/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { nextBuild, nextStart, findPort, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let app

describe('React Profiling Mode', () => {
  describe('without config enabled', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should not have used the react-dom profiling bundle', async () => {
      const browser = await webdriver(appPort, '/')
      const results = await browser.eval('window.profileResults')

      expect(results).toBe(null)
    })
  })

  describe('with config enabled', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          reactProductionProfiling: true
        }
      `
      )
      await nextBuild(appDir, ['--profile'])
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    it('should have used the react-dom profiling bundle', async () => {
      const browser = await webdriver(appPort, '/')
      const results = await browser.eval('window.profileResults')

      expect(results.length).toBe(1)
      expect(results[0] && results[0][0]).toBe('hello')
    })
  })
})
