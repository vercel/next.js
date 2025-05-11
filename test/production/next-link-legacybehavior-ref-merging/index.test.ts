import { nextTestSetup } from 'e2e-utils'

// NOTE: this test is checking for a bug in prefetching code,
// so we only enable it in production

describe('Link with legacyBehavior - handles buggy userspace ref merging', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('does not crash when Link unmounts', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toEqual('Home')
    expect(await browser.hasElementByCssSelector('#test-link')).toBe(true)

    // hide the link, unmounting it
    await browser.elementByCss('button').click()
    expect(await browser.hasElementByCssSelector('#test-link')).toBe(false)

    // shouldn't cause a crash
    expect(await browser.elementByCss('h1').text()).toEqual('Home')
    expect(await browser.elementByCss('body').text()).not.toContain(
      'Application error: a client-side exception has occurred'
    )
  })
})
