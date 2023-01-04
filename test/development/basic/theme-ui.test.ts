import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('theme-ui SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'jsconfig.json': new FileRef(join(__dirname, 'theme-ui/jsconfig.json')),
        pages: new FileRef(join(__dirname, 'theme-ui/pages')),
        'theme.js': new FileRef(join(__dirname, 'theme-ui/theme.js')),
      },
      dependencies: {
        'theme-ui': '0.12.0',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have theme provided styling', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      const color = await browser.elementByCss('#hello').getComputedCss('color')
      expect(color).toBe('rgb(51, 51, 238)')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
