import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe.each([
  { name: 'unsalted', salt: '', identName: '', className: 'AZtFGof7ZUYpyTsu' },
  {
    name: 'salted',
    salt: 'css-modules-salt',
    identName: '',
    className: 'yG4xe_ErqwAQ42yP',
  },
  {
    name: 'custom names',
    salt: '',
    identName: 'compat_[local]',
    className: 'compat_box',
  },
])(
  'webpack-loader-css-modules-context ($name)',
  ({ salt, identName, className: expectedClass }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { 'style-loader': '4.0.0', 'css-loader': '7.1.5' },
      env: { CSS_MODULE_HASH_SALT: salt, CSS_MODULE_IDENT_NAME: identName },
    })

    it('preserves modules, custom insertion, attributes, transform and computed styles', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        const className = await browser
          .elementByCss('#box')
          .getAttribute('data-class')
        expect(className).toBe(expectedClass)
        const style = await browser.eval(
          'document.querySelector(\'#compat-style-target style[data-compat-style="custom"]\')?.textContent'
        )
        expect(style).toMatch(/^\/\* transformed \*\//)
        expect(style).toContain(`.${className}`)
        expect(await browser.elementByCss('#box').getComputedCss('color')).toBe(
          'rgb(7, 8, 9)'
        )
      })
    })

    // Source edits require a development server.
    // @force-gate dev
    it('preserves the class, custom transform and same document during a CSS edit', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#box').getComputedCss('color')).toBe(
          'rgb(7, 8, 9)'
        )
      })
      const className = await browser
        .elementByCss('#box')
        .getAttribute('data-class')
      await browser.eval('window.__cssModulesDocument = "preserved"')
      const source = await next.readFile('styles.injectstyle')
      try {
        await next.patchFile(
          'styles.injectstyle',
          source.replace('7, 8, 9', '9, 8, 7')
        )
        await retry(async () => {
          expect(
            await browser.elementByCss('#box').getComputedCss('color')
          ).toBe('rgb(9, 8, 7)')
          expect(
            await browser.elementByCss('#box').getAttribute('data-class')
          ).toBe(className)
          const style = await browser.eval(
            'document.querySelector(\'#compat-style-target style[data-compat-style="custom"]\')?.textContent'
          )
          expect(style).toMatch(/^\/\* transformed \*\//)
          expect(style).toContain('rgb(9, 8, 7)')
          expect(await browser.eval('window.__cssModulesDocument')).toBe(
            'preserved'
          )
        })
      } finally {
        await next.patchFile('styles.injectstyle', source)
      }
    })
  }
)
