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

  it('should show "no registered resolver" error', async () => {
    await hasRedbox(browser)
    expect(await getRedboxHeader(browser)).toContain(
      `imageLoader has been set to 'custom' in next.config.js but no custom loader is defined`
    )
  })
})
