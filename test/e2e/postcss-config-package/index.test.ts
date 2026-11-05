import { FileRef, nextTestSetup } from 'e2e-utils'
import { gate, getRedboxSource, waitForRedbox } from 'next-test-utils'
import { join } from 'path'

// Tailwind throws a url.parse() deprecation before the fixture can build.
// @force-gate !futureCompat || !start
describe('postcss-config-json', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, 'app')),
    dependencies: {
      autoprefixer: '10.4.19',
      postcss: '8.4.38',
      tailwindcss: '3.4.4',
    },
    packageJson: {
      postcss: {
        plugins: {
          tailwindcss: {},
          autoprefixer: {},
        },
      },
    },
  })

  it('works with postcss config specified in package.json', async () => {
    let browser = await next.browser('/')
    try {
      if (
        await gate(
          (conditions) =>
            conditions.futureCompat && conditions.dev && conditions.turbopack
        )
      ) {
        await waitForRedbox(browser)
        expect(await getRedboxSource(browser)).toContain(
          'DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.'
        )
        return
      }
      const text = await browser.elementByCss('.text-6xl').text()
      expect(text).toMatch(/Welcome to/)
      const cssBlue = await browser
        .elementByCss('#test-link')
        .getComputedCss('color')
      expect(cssBlue).toBe('rgb(37, 99, 235)')
    } finally {
      await browser.close()
    }
  })
})
