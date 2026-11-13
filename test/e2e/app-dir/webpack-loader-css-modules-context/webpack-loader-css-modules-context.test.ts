import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe.each([
  {
    name: 'unsalted',
    salt: '',
    identName: '',
    className: 'AZtFGof7ZUYpyTsu',
    deployedClassName: 'xf6Oeq_dcuQVrNV2',
  },
  {
    name: 'salted',
    salt: 'css-modules-salt',
    identName: '',
    className: 'yG4xe_ErqwAQ42yP',
    deployedClassName: 'z4aql_qsSySZRs4F',
  },
  {
    name: 'custom names',
    salt: '',
    identName: 'compat_[local]',
    className: 'compat_box',
    deployedClassName: 'compat_box',
  },
])(
  'webpack-loader-css-modules-context ($name)',
  ({ salt, identName, className, deployedClassName }) => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      dependencies: { 'style-loader': '4.0.0', 'css-loader': '7.1.5' },
      env: { CSS_MODULE_HASH_SALT: salt, CSS_MODULE_IDENT_NAME: identName },
    })
    // The deployment adapter appends "initial" to the configured hash salt.
    const expectedClass =
      isNextDeploy && process.env.NEXT_ENABLE_ADAPTER === '1'
        ? deployedClassName
        : className

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
