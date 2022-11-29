import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'
import webdriver from 'next-webdriver'
import { BrowserInterface } from 'test/lib/browsers/base'

describe('app-dir root layout redirect', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance
  let browser: BrowserInterface
  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'root-layout-redirect')),
    })

    await next.start()
  })

  afterAll(() => Promise.all([next.destroy(), browser.close()]))

  it('should redirect from root layout', async () => {
    browser = await webdriver(next.appPort, '/')
    expect(await browser.waitForElementByCss('#login').text()).toBe(
      /Login page/
    )
  })
})
