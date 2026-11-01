import { nextTestSetup } from 'e2e-utils'
import { gate, getRedboxSource, waitForRedbox } from 'next-test-utils'

// Tailwind's jiti config loader throws DEP0144 before the fixture can build.
// @force-gate !futureCompat || !start
describe('tailwind-css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      autoprefixer: '10.4.19',
      postcss: '8.4.38',
      tailwindcss: '3.4.4',
    },
  })

  it('works when importing tailwind/tailwind.css', async () => {
    const browser = await next.browser('/')
    try {
      if (
        await gate(
          (conditions) =>
            conditions.futureCompat && conditions.dev && conditions.turbopack
        )
      ) {
        await waitForRedbox(browser)
        expect(await getRedboxSource(browser)).toContain(
          'DeprecationWarning: module.parent is deprecated due to accuracy issues. Please use require.main to find program entry point instead.'
        )
        return
      }
      const text = await browser.elementByCss('.text-6xl').text()
      expect(text).toMatch(/Welcome to/)
      const cssBlue = await browser
        .elementByCss('#test-link')
        .getComputedCss('color')
      expect(cssBlue).toBe('rgb(37, 99, 235)')

      expect(next.cliOutput).not.toContain('Module not found')
      expect(next.cliOutput).not.toContain("Can't resolve")
    } finally {
      await browser.close()
    }
  })
})
