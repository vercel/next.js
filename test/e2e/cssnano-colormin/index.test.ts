import { createNext, FileRef } from 'e2e-utils'
import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('postcss-config-cjs', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'global.css': new FileRef(join(__dirname, 'styles/global.css')),
        pages: new FileRef(join(__dirname, 'pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('does not minify colors to hsla', async () => {
    let browser
    try {
      browser = await webdriver(next.url, '/')
      const nonMinifiedColor = await browser
        .element('.foo')
        .getComputedCss('background-color')
      expect(nonMinifiedColor).toBe('rgb(143 101 98 / 43%)')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
