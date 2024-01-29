import { join } from 'path'
import webdriver from 'next-webdriver'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, shouldRunTurboDevTest } from 'next-test-utils'
import { BrowserInterface } from 'test/lib/browsers/base'

// [TODO]: It is unclear why turbopack takes longer to run this test
// remove once it's fixed
if (shouldRunTurboDevTest()) {
  jest.setTimeout(1000 * 60 * 5)
}

describe('TailwindCSS JIT', () => {
  const { next } = nextTestSetup({
    files: {
      'postcss.config.js': new FileRef(
        join(__dirname, 'tailwind-jit/postcss.config.js')
      ),
      'tailwind.config.js': new FileRef(
        join(__dirname, 'tailwind-jit/tailwind.config.js')
      ),
      pages: new FileRef(join(__dirname, 'tailwind-jit/pages')),
    },
    dependencies: {
      tailwindcss: '2.2.19',
      postcss: '8.3.5',
    },
  })

  it('works with JIT enabled', async () => {
    let browser: BrowserInterface
    try {
      browser = await webdriver(next.url, '/')
      const text = await browser.elementByCss('.text-6xl').text()
      expect(text).toMatch(/Welcome to/)
      const cssBlue = await browser
        .elementByCss('#test-link')
        .getComputedCss('color')
      expect(cssBlue).toBe('rgb(37, 99, 235)')

      const aboutPagePath = join('pages', 'index.js')

      const originalContent = await next.readFile(aboutPagePath)
      const editedContent = originalContent.replace(
        '<a className="text-blue-600" href="https://nextjs.org" id="test-link">',
        '<a className="text-red-600" href="https://nextjs.org" id="test-link">'
      )
      await browser.eval('window.REAL_HMR = 1;')

      // change the content
      try {
        await next.patchFile(aboutPagePath, editedContent)
        await check(
          () => browser.elementByCss('#test-link').getComputedCss('color'),
          /rgb\(220, 38, 38\)/
        )
        expect(await browser.eval('window.REAL_HMR')).toBe(1)
      } finally {
        // add the original content
        await next.patchFile(aboutPagePath, originalContent)
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
