import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('interception-routes-root-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support having a root catch-all and a catch-all in a parallel route group', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('[href="/items/1"]').click()

    // this triggers the /items route interception handling
    await check(
      () => browser.elementById('slot').text(),
      /Intercepted Modal Page. Id: 1/
    )
    await browser.refresh()

    // no longer intercepted, using the page
    await check(() => browser.elementById('slot').text(), /default @modal/)
    await check(
      () => browser.elementById('children').text(),
      /Regular Item Page. Id: 1/
    )
  })

  it('should handle non-intercepted catch-all pages', async () => {
    const browser = await next.browser('/')

    // there's no explicit page for /foobar. This will trigger the catchall [...slug] page
    await browser.elementByCss('[href="/foobar"]').click()
    await check(() => browser.elementById('slot').text(), /default @modal/)
    await check(
      () => browser.elementById('children').text(),
      /Root Catch-All Page/
    )
  })
})
