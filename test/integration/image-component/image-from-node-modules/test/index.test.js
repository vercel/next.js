/* eslint-env jest */
import { findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app
let browser

// #31065
describe('Image Component Tests In Dev Mode', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should apply image config for node_modules', async () => {
    browser = await webdriver(appPort, '/image-from-node-modules')
    expect(
      await browser.elementById('image-from-node-modules').getAttribute('src')
    ).toMatch('i.imgur.com')
  })
})
