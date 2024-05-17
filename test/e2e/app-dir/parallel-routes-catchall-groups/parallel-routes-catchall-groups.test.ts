import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-catchall-groups', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work without throwing any errors about conflicting paths', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Home/)
    })
    await browser.elementByCss('[href="/foo"]').click()
    // Foo has a page route defined, so we'd expect to see the page content
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Foo Page/)
    })
    await browser.back()

    // /bar doesn't have an explicit page path. (group-a) defines a catch-all slot with a separate root layout
    // that only renders a slot (ie no children). So we'd expect to see the fallback slot content
    await browser.elementByCss('[href="/bar"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Catcher/)
    })
  })
})
