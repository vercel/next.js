import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { Playwright } from 'next-webdriver'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

describe('app-dir-prefetch-non-iso-url', () => {
  const { next } = nextTestSetup({
    files: {
      'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  it('should go to iso url', async () => {
    let browser: Playwright

    try {
      browser = await webdriver(next.url, '/')
      await browser.elementByCss('#to-iso').click()
      await check(() => browser.elementByCss('#page').text(), '/[slug]')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should go to non-iso url', async () => {
    let browser: Playwright

    try {
      browser = await webdriver(next.url, '/')
      await browser.elementByCss('#to-non-iso').click()
      await check(() => browser.elementByCss('#page').text(), '/[slug]')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
