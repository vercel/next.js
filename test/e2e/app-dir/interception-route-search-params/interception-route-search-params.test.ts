import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

describe('interception-route-search-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not send an empty rewritten query for an interception rewrite', async () => {
    const nextUrl = '/items'
    const cacheBustingParam = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      undefined,
      nextUrl
    )
    const res = await next.fetch(
      `/items/dialog?tab=archive&_rsc=${cacheBustingParam}`,
      { headers: { rsc: '1', 'next-url': nextUrl } }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('x-nextjs-rewritten-query')).toBeNull()
  })

  // Previously visited routes stay mounted but hidden, so the selectors below
  // only target visible elements.
  it('should render the intercepted page for the new search params after navigating', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#to-items').click()
    await browser.elementByCss('#open-dialog:visible').click()
    await retry(async () => {
      expect(await browser.elementByCss('#modal:visible #dialog').text()).toBe(
        'dialog tab='
      )
    })

    await browser.elementByCss('#close-dialog:visible').click()
    await retry(async () => {
      expect(await browser.elementsByCss('#modal:visible')).toHaveLength(0)
    })

    await browser.elementByCss('#tab-archive:visible').click()
    await retry(async () => {
      expect(await browser.elementByCss('#open-dialog:visible').text()).toBe(
        'Open dialog (/items/dialog?tab=archive)'
      )
    })

    await browser.elementByCss('#open-dialog:visible').click()
    await retry(async () => {
      expect(await browser.url()).toEndWith('/items/dialog?tab=archive')
      expect(await browser.elementByCss('#modal:visible #dialog').text()).toBe(
        'dialog tab=archive'
      )
    })
  })

  // @force-gate prefetching
  it('should not reuse a prefetched intercepted page for other search params', async () => {
    let prefetchedAll = false
    const browser = await next.browser('/prefetch?tab=all', {
      beforePageLoad(page) {
        page.on('response', (response) => {
          const url = new URL(response.url())
          if (
            url.pathname === '/prefetch/dialog' &&
            url.searchParams.get('tab') === 'all' &&
            url.searchParams.has('_rsc')
          ) {
            prefetchedAll = true
          }
        })
      },
    })

    await retry(async () => {
      expect(prefetchedAll).toBe(true)
    })

    await browser.elementByCss('#tab-archive:visible').click()
    await retry(async () => {
      expect(await browser.elementByCss('#open-dialog:visible').text()).toBe(
        'Open dialog (/prefetch/dialog?tab=archive)'
      )
    })

    await browser.elementByCss('#open-dialog:visible').click()
    await retry(async () => {
      expect(await browser.url()).toEndWith('/prefetch/dialog?tab=archive')
      expect(await browser.elementByCss('#modal:visible #dialog').text()).toBe(
        'dialog tab=archive'
      )
    })
  })
})
