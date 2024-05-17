import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('not-found app dir css', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      sass: 'latest',
    },
  })

  if (skipped) {
    return
  }

  it('should load css while navigation between not-found and page', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-404')).backgroundColor`
        )
      ).toEqual('rgb(0, 128, 0)')
    })
    await browser.elementByCss('#go-to-404').click()
    await browser.waitForElementByCss('#go-to-index')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-index')).backgroundColor`
        )
      ).toEqual('rgb(0, 128, 0)')
    })
    await browser.elementByCss('#go-to-index').click()
    await browser.waitForElementByCss('#go-to-404')
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#go-to-404')).backgroundColor`
        )
      ).toEqual('rgb(0, 128, 0)')
    })
  })
})
