import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'
import { BrowserInterface } from '../../lib/browsers/base'
import webdriver from 'next-webdriver'
import { retry } from 'next-test-utils'

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
      browser = await webdriver(next.url, '/')
      await browser.elementByCss('#to-iso').click()
      await retry(async () => {
        expect(await browser.elementByCss('#page').text()).toEqual('/[slug]')
      })
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should go to non-iso url', async () => {
    let browser: BrowserInterface

    try {
      browser = await webdriver(next.url, '/')
      await browser.elementByCss('#to-non-iso').click()
      await retry(async () => {
        expect(await browser.elementByCss('#page').text()).toEqual('/[slug]')
      })
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
