import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('client-only-suspense-empty-shell', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves complete HTML for a page that only suspends in a client component', async () => {
    const $ = await next.render$('/?query=foo')
    expect($('#search').text()).toBe('search: query=foo')
  })

  it('renders a page that only suspends in a client component', async () => {
    const browser = await next.browser('/?query=foo')
    await retry(async () => {
      const text = await browser.elementByCss('#search').text()
      expect(text).toBe('search: query=foo')
    })
  })
})
