import { join } from 'path'
import webdriver from 'next-webdriver'
import { nextTestSetup, FileRef } from 'e2e-utils'

describe('emotion SWC option', () => {
  const { next } = nextTestSetup({
    files: {
      'jsconfig.json': new FileRef(
        join(__dirname, 'emotion-swc/jsconfig.json')
      ),
      pages: new FileRef(join(__dirname, 'emotion-swc/pages')),
      shared: new FileRef(join(__dirname, 'emotion-swc/shared')),
      'next.config.js': new FileRef(
        join(__dirname, 'emotion-swc/next.config.js')
      ),
    },
    dependencies: {
      '@emotion/cache': '^10.0.29',
      '@emotion/core': '^10.0.35',
      '@emotion/styled': '^10.0.27',
    },
  })

  it('should have styling from the css prop', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      const color = await browser
        .elementByCss('#test-element')
        .getComputedCss('background-color')
      expect(color).toBe('rgb(255, 192, 203)')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
