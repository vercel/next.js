import { createNext, FileRef } from 'e2e-utils'
import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('postcss-config-cjs', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'postcss.config.cjs': new FileRef(
          join(__dirname, 'app/postcss.config.cjs')
        ),
        'tailwind.config.cjs': new FileRef(
          join(__dirname, 'app/tailwind.config.cjs')
        ),
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      dependencies: {
        tailwindcss: '2.2.19',
        postcss: '8.3.5',
      },
    })
  })
  afterAll(() => next.destroy())

  it('works with postcss.config.cjs files', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      const text = await browser.elementByCss('.text-6xl').text()
      expect(text).toMatch(/Welcome to/)
      const cssBlue = await browser
        .elementByCss('#test-link')
        .getComputedCss('color')
      expect(cssBlue).toBe('rgb(37, 99, 235)')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
