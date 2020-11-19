/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  hasRedbox,
  getRedboxHeader,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser

describe('Custom Resolver Tests', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
    browser = await webdriver(appPort, '/')
  })
  afterAll(() => killApp(app))

  it('should show "custom resolver registered but not in config" error', async () => {
    await hasRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      `registerCustomResolver can only be used if image loader is set to 'custom' in next.config.js`
    )
  })
})
