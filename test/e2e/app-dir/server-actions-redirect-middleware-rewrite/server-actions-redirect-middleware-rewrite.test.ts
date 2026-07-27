import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - server-actions-redirect-middleware-rewrite.test', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should redirect correctly in nodejs runtime with middleware rewrite', async () => {
    const browser = await next.browser('/server-action/node')
    await browser.waitForElementByCss('button').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#redirected').text()).toBe(
        'Redirected'
      )
    })
    expect(await browser.url()).toBe(`${next.url}/redirect`)
  })

  it('should redirect correctly in edge runtime with middleware rewrite', async () => {
    const browser = await next.browser('/server-action/edge')
    await browser.waitForElementByCss('button').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#redirected').text()).toBe(
        'Redirected'
      )

      expect(await browser.url()).toBe(`${next.url}/redirect`)
    })
  })
})
