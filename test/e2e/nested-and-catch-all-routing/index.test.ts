import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'
import { BrowserInterface } from 'test/lib/browsers/base'
import webdriver from 'next-webdriver'

describe('nested and catch-all routing', () => {
  let next: NextInstance
  let browser: BrowserInterface

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app')),
      dependencies: {},
    })
    browser = await webdriver(next.appPort, '/')
  })

  afterAll(async () => {
    await next.destroy()
    await browser.close()
  })

  it('client and server render should match', async () => {
    await browser.elementByCss('a').click()
    const pageClient = await (await browser.waitForElementByCss('#page')).text()
    await browser.refresh()
    const pageServer = await browser.elementByCss('#page').text()
    expect(pageClient).toBe(pageServer)
  })
})
