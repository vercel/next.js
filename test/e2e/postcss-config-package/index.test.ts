import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

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
