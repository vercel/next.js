/* eslint-env jest */
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  hasRedbox,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

describe('App assetPrefix config', () => {
  let appPort
  let app

  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should render correctly with assetPrefix: "/"', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      await waitFor(2000)
      expect(await hasRedbox(browser)).toBe(false)
      const title = await browser.elementById('title').text()
      expect(title).toBe('IndexPage')
    } finally {
      await browser.close()
    }
  })
})
