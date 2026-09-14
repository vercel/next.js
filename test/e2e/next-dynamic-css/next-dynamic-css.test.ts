import { nextTestSetup } from 'e2e-utils'

describe('next/dynamic css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
  })

  it('should load a Pages Router page correctly', async () => {
    const browser = await next.browser('/')

    expect(
      await browser
        .elementByCss('#__next div:nth-child(2)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })

  it('should load a App Router page correctly', async () => {
    const browser = await next.browser('/test-app')

    expect(
      await browser
        .elementByCss('body div:nth-child(3)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })
})
