import { nextTestSetup } from 'e2e-utils'

describe('css-modules-rsc-postcss', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'postcss-nested': '4.2.1',
      sass: 'latest',
    },
  })

  it('should compile successfully and apply the correct styles', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').getComputedCss('color')).toBe(
      'rgb(0, 128, 0)'
    )
    expect(await browser.elementByCss('span').getComputedCss('color')).toBe(
      'rgb(0, 128, 0)'
    )
  })
})
