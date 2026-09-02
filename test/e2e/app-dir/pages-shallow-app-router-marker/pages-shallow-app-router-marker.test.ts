import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('pages router - shallow navigation with a stale app router marker', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should fetch route info again instead of rendering the marker', async () => {
    const browser = await next.browser('/blog/first')
    expect(await browser.elementById('tab').text()).toBe('a')

    await browser.eval('window.beforeNav = 1')
    // `router.prefetch()` writes this marker into `router.components` when the
    // client router filter matches a prefetched path. Plant it directly so the
    // test does not depend on the Bloom filter contents or on production mode.
    await browser.eval(
      "window.next.router.components['/blog/[slug]'] = { __appRouter: true }"
    )

    await browser.eval(
      "window.next.router.push('/blog/[slug]?tab=b', '/blog/first?tab=b', { shallow: true })"
    )

    await retry(async () => {
      expect(await browser.elementById('tab').text()).toBe('b')
    })
    expect(await browser.elementById('pages-page').text()).toBe(
      'hello from pages/blog/[slug] (first)'
    )
    // A shallow navigation must stay on the client.
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.eval('location.search')).toBe('?tab=b')
  })
})
