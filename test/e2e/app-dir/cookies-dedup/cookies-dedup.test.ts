import { nextTestSetup } from 'e2e-utils'

describe('cookies-dedup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('cookies set by middleware should be removed if action sets the same cookie', async () => {
    const browser = await next.browser('/')
    const url = await browser.url()
    await browser.waitForElementByCss('button#action')

    const actionResponsePromise = browser.waitForResponse(url, {
      timeout: 1000,
    })
    await browser.elementByCss('button#action').click()
    const actionResponse = await actionResponsePromise

    const headers = await actionResponse.allHeaders()
    const setCookieHeaders = headers['set-cookie']
    expect(setCookieHeaders).toEqual('common-cookie=from-action; Path=/')
  })

  it('cookies set by middleware should be removed if api route sets the same cookie', async () => {
    const browser = await next.browser('/')
    const url = await browser.url()
    await browser.waitForElementByCss('button#api')

    const apiResponsePromise = browser.waitForResponse(`${url}api`, {
      timeout: 1000,
    })
    await browser.elementByCss('button#api').click()
    const apiResponse = await apiResponsePromise

    const headers = await apiResponse.allHeaders()
    const setCookieHeaders = headers['set-cookie']
    expect(setCookieHeaders).toEqual('common-cookie=from-api; Path=/')
  })
})
