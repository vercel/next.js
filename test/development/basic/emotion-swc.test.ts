import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { shouldRunTurboDevTest } from '../../lib/next-test-utils'

describe('emotion SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    const useTurbo = !!process.env.TEST_WASM
      ? false
      : shouldRunTurboDevTest().turbo
    next = await createNext({
      files: {
        'jsconfig.json': new FileRef(
          join(__dirname, 'emotion-swc/jsconfig.json')
        ),
        pages: new FileRef(join(__dirname, 'emotion-swc/pages')),
        shared: new FileRef(join(__dirname, 'emotion-swc/shared')),
        // Stopgap until turobpack supports full next.config.js for `reactStrictMode`
        'next.config.js': new FileRef(
          useTurbo
            ? join(__dirname, 'emotion-swc/next.turbopack.config.js')
            : join(__dirname, 'emotion-swc/next.config.js')
        ),
      },
      dependencies: {
        '@emotion/cache': '^10.0.29',
        '@emotion/core': '^10.0.35',
        '@emotion/styled': '^10.0.27',
      },
    })
  })
  afterAll(() => next.destroy())

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
