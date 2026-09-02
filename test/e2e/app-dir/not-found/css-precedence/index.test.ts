import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('not-found app dir css', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
  })

  it('should load css while navigation between not-found and page', async () => {
    const browser = await next.browser('/')
    await check(
      async () =>
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-404')).backgroundColor`
        ),
      'rgb(0, 128, 0)'
    )
    await browser.elementByCss('#go-to-404').click()
    await browser.waitForElementByCss('#go-to-index')
    await check(
      async () =>
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-index')).backgroundColor`
        ),
      'rgb(0, 128, 0)'
    )
    await browser.elementByCss('#go-to-index').click()
    await browser.waitForElementByCss('#go-to-404')
    await check(
      async () =>
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-404')).backgroundColor`
        ),
      'rgb(0, 128, 0)'
    )
  })
})
