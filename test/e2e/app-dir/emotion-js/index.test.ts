import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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
    await retry(
      async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h1')).color`
          )
        ).toBe('rgb(0, 0, 255)')
      },
      30000,
      1000
    )

    const el2 = browser.elementByCss('p')
    expect(await el2.text()).toBe('Red')
    await retry(
      async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('p')).color`
          )
        ).toBe('rgb(255, 0, 0)')
      },
      30000,
      1000
    )
  })
})
