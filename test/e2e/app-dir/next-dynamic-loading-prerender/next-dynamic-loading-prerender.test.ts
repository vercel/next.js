import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next-dynamic-loading-prerender', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    // The fixture asserts the contents of the static prerender.
    skipDeployment: true,
  })

  if (isNextDev) {
    it('skipped in dev', () => {})
    return
  }

  it('renders the lazy component on the client', async () => {
    const browser = await next.browser('/with-loading')

    await retry(async () => {
      expect(await browser.elementByCss('#heavy').text()).toBe(
        'HEAVY_DYNAMIC_CONTENT'
      )
    })
  })

  it('prerenders the lazy component inline without a `loading` option', async () => {
    const html = await next.fetch('/no-loading').then((res) => res.text())

    expect(html).toContain('<p id="heavy">HEAVY_DYNAMIC_CONTENT</p>')
    // Without `loading`, `next/dynamic` does not create a Suspense boundary
    // of its own, so the lazy component suspends the parent boundary.
    expect(html).not.toContain('<!--$?-->')
  })

  it('omits the lazy component from the prerender with a `loading` option', async () => {
    const html = await next.fetch('/with-loading').then((res) => res.text())

    // TODO: This asserts the current behavior. With `loading`, the lazy
    // component gets its own Suspense boundary, which is still pending when
    // the static shell is flushed. Its HTML is therefore missing from the
    // prerender entirely, and the content is not visible without JavaScript.
    expect(html).not.toContain('HEAVY_DYNAMIC_CONTENT')
    expect(html).toContain('<!--$?-->')
  })
})
