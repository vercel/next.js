import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('catchall-parallel-routes-group', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work without throwing any errors about invalid pages', async () => {
    const browser = await next.browser('/')

    await check(() => browser.elementByCss('body').text(), /Root Page/)
    await browser.elementByCss('[href="/foobar"]').click()

    // catch all matches page, but also slot with layout and group
    await check(() => browser.elementByCss('body').text(), /Catch-all Page/)
    await check(
      () => browser.elementByCss('body').text(),
      /Catch-all Slot Group Page/
    )
  })
})
