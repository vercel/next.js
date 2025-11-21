import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('postcss-config-cjs', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, 'app')),
    dependencies: {
      tailwindcss: '2.2.19',
      postcss: '8.3.5',
    },
  })

  it('works with postcss.config.cjs files', async () => {
    let browser = await next.browser('/')
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
