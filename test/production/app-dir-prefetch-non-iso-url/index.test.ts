import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import { BrowserInterface } from '../../lib/browsers/base'
import webdriver from 'next-webdriver'

describe('app-dir-prefetch-non-iso-url', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
        app: new FileRef(join(__dirname, 'app')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should go to iso url', async () => {
    let browser: BrowserInterface

    try {
      browser = await webdriver(next.appPort, '/')
      await browser.elementByCss('#to-iso').click()

      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('/[slug]')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should go to non-iso url', async () => {
    let browser: BrowserInterface

    try {
      browser = await webdriver(next.appPort, '/')
      await browser.elementByCss('#to-non-iso').click()

      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('/[slug]')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
