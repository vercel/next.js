import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/99789: the page's client chunks
// reuse the modules `_app` already loaded. Modules imported only by the page must still be
// chunked, even when they are batched next to a module shared with `_app`.
describe('pages-app-availability-boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('hydrates a page whose imports surround a module shared with _app', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('#hydrated').text()).toBe('yes')
    })
    expect(await browser.elementByCss('#values').text()).toBe(
      'a-page-only,b-boundary,c-shared,d-boundary,e-page'
    )

    const logs = await browser.log()
    expect(
      logs.filter(({ message }) =>
        message.includes('module factory is not available')
      )
    ).toEqual([])
  })
})
