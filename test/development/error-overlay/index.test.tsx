import { nextTestSetup } from 'e2e-utils'

describe('DevErrorOverlay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('can get error code from RSC error thrown by framework', async () => {
    await next.render('/known-rsc-error')
    const browser = await next.browser('/known-rsc-error')
    const errorCode = await browser.waitForElementByCss(
      '[data-nextjs-error-code]'
    )
    const code = await errorCode.getAttribute('data-nextjs-error-code')
    expect(code).toBe('E127')
  })

  it('can get error code from client side error thrown by framework', async () => {
    await next.render('/known-client-error')

    const browser = await next.browser('/known-client-error')

    await browser.elementByCss('button').click() // clicked "break on client"

    const errorCode = await browser.waitForElementByCss(
      '[data-nextjs-error-code]'
    )
    const code = await errorCode.getAttribute('data-nextjs-error-code')
    expect(code).toBe('E209')
  })
})
