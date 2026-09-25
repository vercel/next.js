import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('forwarding an action from a PPR route', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('completes an action after navigating to a PPR page', async () => {
    expect((await next.fetch('/b')).status).toBe(200)

    const browser = await next.browser('/a')
    await browser.waitForElementByCss('#go-to-b')
    await browser.elementById('go-to-b').click()
    await browser.waitForElementByCss('#forward-action')
    expect(new URL(await browser.url()).pathname).toBe('/b')
    let actionResponseStatus: number | undefined
    browser.on('response', (response) => {
      if (
        new URL(response.url()).pathname === '/b' &&
        response.request().method() === 'POST'
      ) {
        actionResponseStatus = response.status()
      }
    })
    await browser.elementById('forward-action').click()

    await retry(async () => {
      expect(
        await browser.eval('sessionStorage.getItem("action-status")')
      ).toBe('pong')
      expect(actionResponseStatus).toBe(200)
    }, 15_000)
  })
})
