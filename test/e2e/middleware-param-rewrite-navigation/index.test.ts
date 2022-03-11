import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import { BrowserInterface } from 'test/lib/browsers/base'
import webdriver from 'next-webdriver'

describe('Middleware param rewrite navigation', () => {
  let next: NextInstance
  let browser: BrowserInterface

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
      },
    })
    browser = await webdriver(next.appPort, '/a')
  })

  afterAll(() => Promise.all([next.destroy(), browser.close()]))

  it('should work', async () => {
    // First render
    expect(await browser.elementByCss('span').text()).toBe('b')

    // After client navigation
    await browser.elementByCss('a').click()
    expect(await browser.elementByCss('span').text()).toBe('a')
  })
})
