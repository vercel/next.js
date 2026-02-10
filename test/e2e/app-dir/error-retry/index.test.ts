import { nextTestSetup } from 'e2e-utils'

describe('error-retry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should recover from server error using retry()', async () => {
    const browser = await next.browser('/')

    // 1. Force error
    await browser.addCookie({ name: 'force-error', value: 'true' })
    await browser.refresh()

    const text = await browser.elementById('error-message').text()
    expect(text).toMatch(
      /Server Error Forced|An error occurred in the Server Components render/
    )

    // Check component stack presence
    const stack = await browser.elementById('component-stack').text()
    expect(stack).toBeTruthy()

    // 2. Fix error condition
    await browser.addCookie({ name: 'force-error', value: 'false' })

    // 3. Try retry (should work because it refreshes data)
    await browser.elementById('btn-retry').click()

    await browser.waitForElementByCss('#success')
    expect(await browser.elementById('success').text()).toBe(
      'Content Loaded Successfully'
    )
  })
})
