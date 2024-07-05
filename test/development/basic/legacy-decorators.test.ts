import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

describe('Legacy decorators SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    try {
      next = await createNext({
        files: {
          'jsconfig.json': new FileRef(join(__dirname, 'legacy-decorators/jsconfig.json')),
          pages: new FileRef(join(__dirname, 'legacy-decorators/pages')),
        },
        dependencies: {
          mobx: '6.3.7',
          'mobx-react': '7.2.1',
        },
      })
    } catch (error) {
      console.error('Failed to create Next instance:', error)
      throw error
    }
  }, 300000)

  afterAll(async () => {
    if (next) {
      await next.destroy()
    }
  })

  it('should compile with legacy decorators enabled', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      
      await waitFor(2000)

      const initialText = await browser.elementByCss('#count').text()
      expect(initialText).toBe('Current number: 0')

      await browser.elementByCss('#increase').click()
      
      await check(
        () => browser.elementByCss('#count').text(),
        'Current number: 1'
      )
    } catch (error) {
      console.error('Test failed:', error)
      throw error
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }, 30000)
})
