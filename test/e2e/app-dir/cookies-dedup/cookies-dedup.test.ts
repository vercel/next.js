import { nextTestSetup } from 'e2e-utils'

describe('cookies-dedup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('cookies set by middleware should be removed if action sets the same cookie', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('button#action')
    await browser.elementByCss('button#action').click()
    await browser.waitForIdleNetwork()

    const cookies = await browser.getCookies()
    expect(cookies.length).toEqual(1)
    expect(cookies[0].name).toEqual('common-cookie')
    expect(cookies[0].value).toEqual('from-action')
  })

  it('cookies set by middleware should be removed if api route sets the same cookie', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('button#api')
    await browser.elementByCss('button#api').click()
    await browser.waitForIdleNetwork()

    const cookies = await browser.getCookies()
    expect(cookies.length).toEqual(1)
    expect(cookies[0].name).toEqual('common-cookie')
    expect(cookies[0].value).toEqual('from-api')
  })
})
