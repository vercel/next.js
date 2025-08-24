import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app dir - emotion-js', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@emotion/react': 'latest',
      '@emotion/cache': 'latest',
    },
  })

  if (skipped) {
    return
  }

  it('should render emotion-js css with compiler.emotion option correctly', async () => {
    const browser = await next.browser('/')
    const el = browser.elementByCss('h1')
    expect(await el.text()).toBe('Blue')
    await check(
      async () =>
        await browser.eval(
          `window.getComputedStyle(document.querySelector('h1')).color`
        ),
      'rgb(0, 0, 255)'
    )

    const el2 = browser.elementByCss('p')
    expect(await el2.text()).toBe('Red')
    await check(
      async () =>
        await browser.eval(
          `window.getComputedStyle(document.querySelector('p')).color`
        ),
      'rgb(255, 0, 0)'
    )
  })
})
