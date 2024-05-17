import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-routes-root-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support having a root catch-all and a catch-all in a parallel route group', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('[href="/items/1"]').click()

    // this triggers the /items route interception handling
    await retry(async () => {
      expect(await browser.elementById('slot').text()).toMatch(
        /Intercepted Modal Page. Id: 1/
      )
    })
    await browser.refresh()

    // no longer intercepted, using the page
    await retry(async () => {
      expect(await browser.elementById('slot').text()).toMatch(/default @modal/)
    })
    await retry(async () => {
      expect(await browser.elementById('children').text()).toMatch(
        /Regular Item Page. Id: 1/
      )
    })
  })

  it('should handle non-intercepted catch-all pages', async () => {
    const browser = await next.browser('/')

    // there's no explicit page for /foobar. This will trigger the catchall [...slug] page
    await browser.elementByCss('[href="/foobar"]').click()
    await retry(async () => {
      expect(await browser.elementById('slot').text()).toMatch(/default @modal/)
    })
    await retry(async () => {
      expect(await browser.elementById('children').text()).toMatch(
        /Root Catch-All Page/
      )
    })
  })
})
