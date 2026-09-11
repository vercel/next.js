import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import { join } from 'path'

// This suite runs node server.js and asserts cookies set by that custom server.
// The deploy harness does not run the custom startCommand on Vercel.
// @force-gate !deploy
describe('custom-app-server-action-redirect', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'custom-server'),
    startCommand: 'node server.js',
    serverReadyPattern: /Next mode: (production|development)/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it('redirects with basepath properly when server action handler uses `redirect`', async () => {
    const browser = await next.browser('/base')
    const getCount = async () => browser.elementByCss('#current-count').text()

    // Increase count to track if the page reloaded
    await browser.elementByCss('#increase-count').click().click()
    await retry(async () => {
      expect(await getCount()).toBe('Count: 2')
    })

    await browser.elementById('submit-server-action-redirect').click()

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'Another Page'
    )
    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/base/another`
    )

    // Count should still be 2 as the browser should not have reloaded the page.
    expect(await getCount()).toBe('Count: 2')
  })

  it('redirects with proper cookies set from both redirect response and post respose', async () => {
    const browser = await next.browser('/base')

    await browser.elementById('submit-server-action-redirect').click()

    expect(await browser.waitForElementByCss('#another').text()).toBe(
      'Another Page'
    )
    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/base/another`
    )
    await check(
      () => browser.eval('document.cookie'),
      /custom-server-test-cookie/
    )
    await check(
      () => browser.eval('document.cookie'),
      /custom-server-action-test-cookie/
    )
  })
})
