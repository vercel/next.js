import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-and-interception-nested-dynamic-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // TODO: re-enable when resolved related thread
    // https://vercel.slack.com/archives/C07UCHRBWGK/p1759165345308879
    skipDeployment: true,
  })

  it('should intercept the route for nested dynamic routes', async () => {
    const browser = await next.browser('/1/1')
    expect(await browser.elementByCss('h1').text()).toBe('foo id 1, bar id 1')
    await browser.elementByCss('a').click()

    // Should intercept the route.
    expect(await browser.waitForElementByCss('p').text()).toBe('intercepted!')
    // Should preserve the previous component.
    expect(await browser.elementByCss('h1').text()).toBe('foo id 1, bar id 1')

    await browser.refresh()
    // Should display the correct /baz_id/1 content.
    expect(await browser.waitForElementByCss('p').text()).toBe('baz_id/1')
  })
})
