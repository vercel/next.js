/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  check,
  getPageFileFromBuildManifest,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let app

describe('Failing to load _error', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterAll(() => killApp(app))

    it('handles failing to load _error correctly', async () => {
      await nextBuild(appDir)
      const appPort = await findPort()
      app = await nextStart(appDir, appPort)

      const browser = await webdriver(appPort, '/')
      await browser.eval(`window.beforeNavigate = true`)

      await browser.elementByCss('#to-broken').moveTo()
      await check(
        async () => {
          const scripts = await browser.elementsByCss('script')
          let found = false

          for (const script of scripts) {
            const src = await script.getAttribute('src')
            if (src.includes('broken-')) {
              found = true
              break
            }
          }
          return found
        },
        {
          test(content) {
            return content === true
          },
        }
      )

      const errorPageFilePath = getPageFileFromBuildManifest(appDir, '/_error')
      // remove _error client bundle so that it can't be loaded
      await fs.remove(join(appDir, '.next', errorPageFilePath))

      await browser.elementByCss('#to-broken').click()

      await check(async () => {
        return !(await browser.eval('window.beforeNavigate'))
          ? 'reloaded'
          : 'fail'
      }, /reloaded/)
    })
  })
})
