import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic-interception-route-revalidate', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should refresh the dynamic intercepted route when the interception route is revalidated', async () => {
    const browser = await next.browser('/en')

    // trigger the interception
    await browser.elementByCss("[href='/en/photos/1/view']").click()

    // verify we're on the intercepted page
    await browser.waitForElementByCss('#intercepted-page')

    expect(await browser.elementByCss('h2').text()).toBe('Photo Id: 1')

    // trigger the revalidate
    await browser.elementByCss('button').click()

    // make sure the loading state fired
    await browser.waitForElementByCss('#loading')

    // verify that we get a result from the server action
    await retry(async () => {
      const result = await browser.elementByCss('#result').text()
      expect(result).toMatch(/^Result: 0(\.\d+)?$/)
    })

    // make sure we're still on the intercepted page
    expect(await browser.hasElementByCssSelector('#intercepted-page')).toBe(
      true
    )

    // refresh the page to get the full (non-intercepted) page
    await browser.refresh()

    expect(await browser.hasElementByCssSelector('#intercepted-page')).toBe(
      false
    )
    expect(await browser.hasElementByCssSelector('#full-page')).toBe(true)
  })
})
