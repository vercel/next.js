import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
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

  it.each([
    {
      state: 'cold',
      tenant: 'initech',
    },
    {
      state: 'stale',
      tenant: 'globex',
    },
  ])(
    'requests the missing head for a $state path when page segments are cached',
    async ({ tenant, state }) => {
      const firstHref = '/page-with-per-tenant-head/en/acme'
      const secondHref = '/page-with-per-tenant-head/en/' + tenant
      const pageText = 'Locale: en'
      // Vercel serves complete stale prerenders. next start renders stale RSC
      // against the request tree while revalidating.
      const expectsStaticResponse = state === 'cold' || (await gate('vercel'))
      let act: ReturnType<typeof createRouterAct>
      const navigationRequestTrees: Array<string | null> = []
      const navigationResponses: Playwright.Response[] = []
      const targetUrl = new URL(secondHref, next.url)
      const title = `Tenant: ${tenant}`
      if (state === 'stale') {
        const document = await next.fetch(secondHref)
        expect(document.status).toBe(200)
        expect(await document.text()).toContain(title)
        const revalidation = await next.fetch(
          '/segment-cache-metadata/revalidate',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tenant }),
          }
        )
        expect(revalidation.status).toBe(204)
      }

      function isTargetNavigation(request: Playwright.Request) {
        const headers = request.headers()
        const url = new URL(request.url())
        url.searchParams.delete('_rsc')
        return (
          url.href === targetUrl.href &&
          headers.rsc === '1' &&
          headers[NEXT_ROUTER_PREFETCH_HEADER] === undefined
        )
      }

      const browser = await next.browser('/', {
        beforePageLoad(page: Playwright.Page) {
          act = createRouterAct(page)
          page.on('request', (request) => {
            if (isTargetNavigation(request)) {
              const encoded = request.headers()[NEXT_ROUTER_STATE_TREE_HEADER]
              navigationRequestTrees.push(
                encoded === undefined ? null : decodeURIComponent(encoded)
              )
            }
          })
          page.on('response', (response) => {
            if (isTargetNavigation(response.request())) {
              navigationResponses.push(response)
            }
          })
        },
      })

      // The first URL supplies reusable page segments and its own head.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${firstHref}"]`)
          .click()
      }, [{ includes: pageText }, { includes: 'Tenant: acme' }])

      // Reveal the second URL without prefetching. Only its head is missing.
      await act(async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${secondHref}"]`)
          .click()
      }, 'no-requests')

      await act(
        async () => {
          await browser.elementByCss(`a[href="${secondHref}"]`).click()
        },
        expectsStaticResponse
          ? { includes: title }
          : [{ includes: title }, { includes: pageText, block: 'reject' }]
      )
      expect(navigationRequestTrees).toEqual([METADATA_ONLY_REQUEST_TREE])
      expect(navigationResponses.length).toBeGreaterThan(0)
      for (const response of navigationResponses) {
        expect(response.status()).toBe(200)
        if (expectsStaticResponse) {
          // A complete cached prerender includes the page despite the request
          // tree.
          expect(response.headers()['x-nextjs-prerender']).toBe('1')
          expect(await response.text()).toContain(pageText)
        } else {
          expect(response.headers()['x-nextjs-prerender']).toBeUndefined()
          expect(await response.text()).not.toContain(pageText)
        }
      }

      expect(await browser.elementById('target-page').text()).toBe(pageText)
      await retry(async () => {
        expect(await browser.eval(() => document.title)).toBe(title)
      })
    }
  )
})
