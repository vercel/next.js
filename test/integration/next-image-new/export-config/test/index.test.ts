/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  getRedboxHeader,
  hasRedbox,
  killApp,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let app
let stderr = ''

describe('next/image with output export config', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    })
    afterAll(async () => {
      await killApp(app)
      stderr = ''
    })
    it('should error', async () => {
      const browser = await webdriver(appPort, '/')
      const msg =
        "Image Optimization using the default loader is not compatible with `{ output: 'export' }`."
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(msg)
      expect(stderr).toContain(msg)
    })
  })
})
