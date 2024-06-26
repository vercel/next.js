import { nextTestSetup } from 'e2e-utils'

describe('turbopack-not-picking-up-config-from-pkg-json', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      tailwindcss: '3.4.4',
      postcss: '8.4.38',
    },
    packageJson: {
      postcss: {
        plugins: {
          tailwindcss: {},
        },
      },
    },
  })

  it('should ', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').getComputedCss('display')).toBe(
      'flex'
    )
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
