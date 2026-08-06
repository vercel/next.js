import { nextTestSetup } from 'e2e-utils'

describe('resuming-head-runtime-search-param', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not show resumable slots error when using runtime search params', async () => {
    const browser = await next.browser('/?foo=bar&test=123')

    // Check that the page renders correctly
    await browser.waitForElementByCss('p')
    const text = await browser.elementByCss('p').text()
    expect(text).toContain('hello world')

    // Wait for dynamic content to load (it's rendered inside the first p element)
    await browser.waitForElementByCss('p p')
    const dynamicText = await browser.elementByCss('p p').text()
    expect(dynamicText).toContain('Dynamic Hole')

    // Check server logs for the specific error message
    expect(next.cliOutput).not.toContain(
      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
    )
  })
})
