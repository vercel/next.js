import { nextTestSetup } from 'e2e-utils'

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
