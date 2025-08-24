/* eslint-env jest */
import { join } from 'path'
import {
  assertNoRedbox,
  killApp,
  findPort,
  launchApp,
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
      await assertNoRedbox(browser)
      const title = await browser.elementById('title').text()
      expect(title).toBe('IndexPage')
    } finally {
      await browser.close()
    }
  })
})
