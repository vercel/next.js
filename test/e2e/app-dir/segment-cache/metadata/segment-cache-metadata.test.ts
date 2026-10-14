import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

const NEXT_ROUTER_STATE_TREE_HEADER = 'next-router-state-tree'
const NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch'

// The request tree the client sends when every segment is cached and only the
// head is missing. Mirrors MetadataOnlyRequestTree in the segment cache.
const METADATA_ONLY_REQUEST_TREE = JSON.stringify([
  '',
  {},
  null,
  'metadata-only',
])

describe('segment cache (metadata)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }
  describe("regression: prefetch the head if it's missing even if all other data is cached", () => {
    it('pages with dynamic content and dynamic metadata, using a full prefetch', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Fully prefetch a page
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/page-with-dynamic-head"]'
        )
        await checkbox.click()
      }, [
        {
          includes: 'Target page',
        },
        // Because the link is prefetched with prefetch={true},
        // we should be able to prefetch the title, even though it's dynamic.
        {
          includes: 'Dynamic Title',
        },
      ])

      // Now prefetch a link that rewrites to the same underlying page.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/rewrite-to-page-with-dynamic-head"]'
        )
        await checkbox.click()
      }, [
        {
          includes: 'Target page',
          block: 'reject',
        },
        // It should not prefetch the page title or content again, because it
        // was already cached.
        {
          includes: 'Dynamic Title',
          block: 'reject',
        },
      ])

      // When we navigate to the page, it should not make any additional
      // network requests, because both the segment data and the head were
      // fully prefetched.
      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-page-with-dynamic-head"]'
        )
        await link.click()
        const pageContent = await browser.elementById('target-page')
        expect(await pageContent.text()).toBe('Target page')
        const title = await browser.eval(() => document.title)
        expect(title).toBe('Dynamic Title')
      }, 'no-requests')
    })

    it('pages with runtime-prefetchable content and dynamic metadata, using a runtime prefetch', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Runtime-prefetch a page.
      // It only uses cookies, so this should be a complete prefetch.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/page-with-runtime-prefetchable-head"]'
        )
        await checkbox.click()
      }, [
        {
          includes: 'Target page',
        },
        // Because the link is prefetched with prefetch={true},
        // we should be able to prefetch the title, even though it's dynamic.
        {
          includes: 'Runtime-prefetchable title',
        },
      ])

      // Now runtime-prefetch a link that rewrites to the same underlying page.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/rewrite-to-page-with-runtime-prefetchable-head"]'
        )
        await checkbox.click()
      }, [
        {
          includes: 'Target page',
          block: 'reject',
        },
        // It should not prefetch the page title or content again, because it
        // was already cached.
        {
          includes: 'Runtime-prefetchable title',
          block: 'reject',
        },
      ])

      // When we navigate to the page, it should not make any additional
      // network requests, because both the segment data and the head were
      // fully prefetched.
      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-page-with-runtime-prefetchable-head"]'
        )
        await link.click()
        const pageContent = await browser.elementById('target-page')
        expect(await pageContent.text()).toBe('Target page')
        const title = await browser.eval(() => document.title)
        expect(title).toBe('Runtime-prefetchable title')
      }, 'no-requests')
    })
  })

  // On the platform a cold ISR path is served from a completed static
  // prerender that cannot vary on the request tree, so the page body is sent
  // along with the head.
  // @gate !deploy
  it('requests only the head when the page segments are cached', async () => {
    let act: ReturnType<typeof createRouterAct>
    // The request tree of every navigation request (RSC requests that are
    // not prefetches), decoded from its header.
    const navigationRequestTrees: Array<string | null> = []
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
        p.on('request', (request) => {
          const headers = request.headers()
          if (
            headers['rsc'] === '1' &&
            headers[NEXT_ROUTER_PREFETCH_HEADER] === undefined
          ) {
            const encoded = headers[NEXT_ROUTER_STATE_TREE_HEADER]
            navigationRequestTrees.push(
              encoded === undefined ? null : decodeURIComponent(encoded)
            )
          }
        })
      },
    })

    // Prefetch the prerendered tenant. The body reads only the locale, so
    // this caches it for every tenant in "en"; the head reads the tenant, so
    // only acme's head is cached.
    await act(async () => {
      const checkbox = await browser.elementByCss(
        'input[data-link-accordion="/page-with-per-tenant-head/en/acme"]'
      )
      await checkbox.click()
    }, [{ includes: 'Locale: en' }, { includes: 'Tenant: acme' }])

    // Reveal a link to a tenant that is not prerendered, without prefetching
    // it. Its head is the only thing missing from the cache.
    await act(async () => {
      const checkbox = await browser.elementByCss(
        'input[data-link-accordion="/page-with-per-tenant-head/en/initech"]'
      )
      await checkbox.click()
    }, 'no-requests')

    // The navigation asks the server for the head alone. The response carries
    // the new tenant's title and no page body.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/page-with-per-tenant-head/en/initech"]'
      )
      await link.click()
    }, [
      { includes: 'Tenant: initech' },
      { includes: 'Locale: en', block: 'reject' },
    ])
    expect(navigationRequestTrees).toEqual([METADATA_ONLY_REQUEST_TREE])

    // The body is the cached one, rendered under the new tenant's title.
    const pageContent = await browser.elementById('target-page')
    expect(await pageContent.text()).toBe('Locale: en')
    await retry(async () => {
      const title = await browser.eval(() => document.title)
      expect(title).toBe('Tenant: initech')
    })
  })
})
