import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'
import type * as Playwright from 'playwright'
import { startFakeCDN, type FakeCDN } from '../../../lib/fake-cdn.mjs'
import {
  CLIENT_RENDER_INSTRUCTION,
  clickCounter,
  expectCacheableByCdn,
  expectHydrated,
  expectNoConsoleErrors,
  expectStoredPartialDocument,
  holdRequests,
  isDynamicRSCRequest,
  openPage,
  serveDocumentFromSnapshot,
  snapshotDocument,
  waitForHole,
  withPage,
} from './ppr-cdn-mode.util'
import {
  expectClientStateSurvivesRefresh,
  expectMultipleHolesFillFromOneRequest,
  expectPartialDocumentContract,
  expectServedFromCdn,
  expectServerActionUpdatesPage,
} from './ppr-cdn-mode.cases.util'

// The inlined chunk-group bootstrap of Turbopack's shared runtime.
const BOOTSTRAP_MARKER = '"otherChunks"'

// Waits long enough for a hard navigation to have started, where the test
// asserts that none happens.
const RELOAD_SETTLE_MS = 1500

// `next dev` always renders dynamically, so there's no stored document to
// serve. Vercel isn't a target of the mode yet.
// @force-gate !dev && !vercel
describe('ppr-cdn-mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('document contract', () => {
    it('stores a partial page as a complete, cacheable document', async () => {
      await expectPartialDocumentContract(next)
    })

    it('serves the same document whatever the request carries', async () => {
      const bodies = [
        await next.render('/partial'),
        await next.render('/partial', undefined, {
          headers: { cookie: 'ppr-cdn-mode-flavor=mint' },
        }),
        await next.render('/partial', undefined, {
          headers: { 'accept-language': 'de-DE' },
        }),
        await next.render('/partial?utm_source=ppr-cdn-mode'),
      ]
      expect(new Set(bodies).size).toBe(1)
    })

    // Only Turbopack inlines a chunk-group bootstrap.
    // @force-gate turbopack
    it('includes the Turbopack bootstrap without a nonce', async () => {
      const $ = cheerio.load(await next.render('/partial'))
      const bootstraps = $('script:not([src])')
        .toArray()
        .filter((element) => $(element).html()!.includes(BOOTSTRAP_MARKER))
        .map((element) => ({ nonce: $(element).attr('nonce') }))
      expect(bootstraps).toEqual([{ nonce: undefined }])
    })

    // Reads the build output.
    // @force-gate !deploy
    it('stores the same bytes that it serves', async () => {
      const stored = await next.readFile('.next/server/app/partial.html')
      expect(await next.render('/partial')).toBe(stored)
    })

    it('leaves a fully static page unchanged', async () => {
      const res = await next.fetch('/static')
      const html = await res.text()
      expect(res.status).toBe(200)
      expectCacheableByCdn(res.headers)
      expect(html.trimEnd()).toEndWith('</html>')
      expect(html).toContain('self.__next_f.push(')
      expect(html).not.toMatch(CLIENT_RENDER_INSTRUCTION)
      expect(cheerio.load(html)('#heading').text()).toBe('Static page')
    })

    it('still renders an empty (blocking) shell on the server', async () => {
      const res = await next.fetch('/blocking')
      const html = await res.text()
      expect(res.headers.get('cache-control')).toContain('no-store')
      expect(cheerio.load(html)('#dynamic').text()).toMatch(/^Blocking: \d+$/)
      expect(html).not.toMatch(CLIENT_RENDER_INSTRUCTION)
    })
  })

  // The fake CDN listens on a local port.
  // @force-gate !deploy
  describe('behind a caching CDN', () => {
    let cdn: FakeCDN | undefined

    beforeAll(async () => {
      cdn = await startFakeCDN({ destPort: Number(next.appPort) })
    })

    afterAll(async () => {
      await cdn?.close()
    })

    it('serves a partial page from the CDN and fills its hole with one request', async () => {
      await expectServedFromCdn(next, cdn!)
    })

    it('fills in params that were unknown at build', async () => {
      for (const slug of ['cdn-x', 'cdn-y']) {
        const { browser, fullPayloadRequests } = await openPage(
          next,
          `/fallback/${slug}`,
          { baseUrl: cdn!.port }
        )
        await expectHydrated(browser)
        await waitForHole(browser)
        expect(await browser.elementById('dynamic').text()).toStartWith(
          `Slug: ${slug},`
        )
        expect(await browser.elementById('client-slug').text()).toBe(
          `Client slug: ${slug}`
        )
        expect(fullPayloadRequests).toEqual([`/fallback/${slug}`])
        await expectNoConsoleErrors(browser)
      }

      // Each URL got the shared fallback shell, which has no Cache-Control
      // yet. This CDN stores anything that isn't `no-store`, but a real one
      // may not.
      const documents = cdn!.requests.filter(
        (request) =>
          request.url.startsWith('/fallback/cdn-') && !request.headers['rsc']
      )
      expect(documents.map(({ url, result }) => [url, result])).toEqual([
        ['/fallback/cdn-x', 'miss'],
        ['/fallback/cdn-y', 'miss'],
      ])
      const shell = await next.fetch('/fallback/cdn-z')
      expect(await shell.text()).toContain('__NEXT_CLIENT_RESUME=fetch(')
      expect(shell.headers.get('cache-control')).toBeNull()

      // With Partial Prefetching, the first request also rendered the URL's
      // own document in the background, which a CDN can store.
      await retry(async () => {
        const res = await next.fetch('/fallback/cdn-x')
        expect(await res.text()).not.toContain('__NEXT_CLIENT_RESUME')
        expectCacheableByCdn(res.headers)
      }, 10_000)
    })
  })

  describe('hydrating and filling holes', () => {
    // The portable stand-in for a CDN: the browser gets a snapshot of the
    // document, and every other request goes to the server.
    async function openFromSnapshot(
      url: string,
      options: {
        beforePageLoad?: (page: Playwright.Page) => Promise<void>
      } = {}
    ) {
      const pathname = new URL(url, 'http://n').pathname
      const snapshot = await snapshotDocument(next, pathname)
      const opened = await openPage(next, url, {
        async beforePageLoad(page) {
          await serveDocumentFromSnapshot(page, pathname, snapshot)
          await options.beforePageLoad?.(page)
        },
      })
      return { ...opened, snapshot }
    }

    it('keeps client state in the static part while the refresh fills the hole', async () => {
      await expectClientStateSurvivesRefresh(next)
    })

    it('mounts client components inside a hole after the refresh', async () => {
      const { browser } = await openFromSnapshot('/partial')
      await expectHydrated(browser)
      await waitForHole(browser, 'hole-counter')
      await browser.elementById('hole-counter').click()
      await retry(async () => {
        expect(await browser.elementById('hole-counter').text()).toBe(
          'Hole count: 1'
        )
      })
      await expectNoConsoleErrors(browser)
    })

    it('fills every hole from one dynamic request', async () => {
      await expectMultipleHolesFillFromOneRequest(next)
    })

    it('renders search params from the same stored document', async () => {
      const snapshot = await snapshotDocument(next, '/partial-search')
      for (const q of ['a', 'b']) {
        const { browser } = await openPage(next, `/partial-search?q=${q}`, {
          beforePageLoad: (page) =>
            serveDocumentFromSnapshot(page, '/partial-search', snapshot),
        })
        await expectHydrated(browser)
        await waitForHole(browser)
        expect(await browser.elementById('dynamic').text()).toBe(`q: ${q}`)
        await expectNoConsoleErrors(browser)
      }
    })

    it('sends cookies with the refresh, not the document', async () => {
      const { browser, snapshot } = await openFromSnapshot('/partial-cookies', {
        async beforePageLoad(page) {
          await page.context().addCookies([
            {
              name: 'ppr-cdn-mode-flavor',
              value: 'mint',
              url: next.url,
            },
          ])
        },
      })
      await expectHydrated(browser)
      await waitForHole(browser)
      expect(await browser.elementById('dynamic').text()).toBe('Flavor: mint')
      await expectNoConsoleErrors(browser)

      const withCookie = await next.render('/partial-cookies', undefined, {
        headers: { cookie: 'ppr-cdn-mode-flavor=mint' },
      })
      expect(withCookie).toBe(snapshot.body)
    })

    it('updates the title from dynamic metadata', async () => {
      const { browser } = await openFromSnapshot('/metadata')
      await expectHydrated(browser)
      await waitForHole(browser)
      await retry(async () => {
        expect(await browser.eval(() => document.title)).toMatch(
          /^Dynamic title \d+$/
        )
      })
      expect(
        await browser.eval(() => document.querySelectorAll('title').length)
      ).toBe(1)
      await expectNoConsoleErrors(browser)
    })
  })

  describe('fallback shells', () => {
    // Reads the build output.
    // @force-gate !deploy
    it('stores the fallback shell as a complete document that fetches its payload', async () => {
      const html = await next.readFile('.next/server/app/fallback/[slug].html')
      expectStoredPartialDocument(html)
      expect(html).toContain('__NEXT_CLIENT_RESUME=fetch(')
      expect(html).not.toContain('Slug: ')
    })

    // Serves the build output.
    // @force-gate !deploy
    it('hydrates the fallback shell from the fetched payload', async () => {
      const shell = await next.readFile('.next/server/app/fallback/[slug].html')
      const { browser, fullPayloadRequests, dynamicRSCRequests } =
        await openPage(next, '/fallback/shell', {
          beforePageLoad: (page) =>
            serveDocumentFromSnapshot(page, '/fallback/shell', {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8' },
              body: shell,
            }),
        })
      await expectHydrated(browser)
      await waitForHole(browser)
      expect(await browser.elementById('dynamic').text()).toStartWith(
        'Slug: shell,'
      )
      expect(await browser.elementById('client-slug').text()).toBe(
        'Client slug: shell'
      )
      expect(fullPayloadRequests).toEqual(['/fallback/shell'])
      expect(dynamicRSCRequests).toHaveLength(1)
      await expectNoConsoleErrors(browser)
    })

    it('hydrates a prerendered param from the inline payload', async () => {
      const { browser, fullPayloadRequests, dynamicRSCRequests } =
        await openPage(next, '/fallback/a')
      await expectHydrated(browser)
      await waitForHole(browser)
      expect(await browser.elementById('dynamic').text()).toStartWith(
        'Slug: a,'
      )
      expect(await browser.elementById('client-slug').text()).toBe(
        'Client slug: a'
      )
      expect(fullPayloadRequests).toEqual([])
      expect(dynamicRSCRequests).toHaveLength(1)
      await expectNoConsoleErrors(browser)
    })

    // Depends on what `next start` serves for a param it hasn't seen.
    // @force-gate !deploy
    it('serves the shared shell first, then the param document', async () => {
      const first = await openPage(next, '/fallback/upgrade')
      await expectHydrated(first.browser)
      await waitForHole(first.browser)
      expect(await first.browser.elementById('client-slug').text()).toBe(
        'Client slug: upgrade'
      )
      expect(first.fullPayloadRequests).toEqual(['/fallback/upgrade'])
      await expectNoConsoleErrors(first.browser)

      await retry(async () => {
        const res = await next.fetch('/fallback/upgrade')
        const html = await res.text()
        expect(html).not.toContain('__NEXT_CLIENT_RESUME')
        expectStoredPartialDocument(html)
        expectCacheableByCdn(res.headers)
      }, 10_000)

      const upgraded = await openPage(next, '/fallback/upgrade')
      await expectHydrated(upgraded.browser)
      await waitForHole(upgraded.browser)
      expect(upgraded.fullPayloadRequests).toEqual([])
      expect(upgraded.dynamicRSCRequests).toHaveLength(1)
      await expectNoConsoleErrors(upgraded.browser)
    })
  })

  describe('revalidation', () => {
    it('stores a new document after the shell revalidates', async () => {
      const before = await snapshotDocument(next, '/partial-revalidate')
      const valueBefore = cheerio.load(before.body)('#static-value').text()
      await next.fetch('/revalidate', { method: 'POST' })

      let after = before
      await retry(async () => {
        after = await snapshotDocument(next, '/partial-revalidate')
        expect(cheerio.load(after.body)('#static-value').text()).not.toBe(
          valueBefore
        )
      }, 10_000)
      expectStoredPartialDocument(after.body)
      expectCacheableByCdn(after.headers)

      const { browser } = await openPage(next, '/partial-revalidate')
      await expectHydrated(browser)
      await waitForHole(browser)
      await expectNoConsoleErrors(browser)
    })

    // The fixture switches the page by rewriting a file on the server.
    // @force-gate !deploy
    describe('static to partial', () => {
      async function setMode(partial: boolean) {
        await next.fetch('/static-to-partial/mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ partial }),
        })
        await retry(async () => {
          const $ = cheerio.load(await next.render('/static-to-partial'))
          expect($('#mode').text()).toBe(partial ? 'partial' : 'static')
        }, 10_000)
      }

      afterAll(async () => {
        await setMode(false)
      })

      it('stores a partial document once a static page turns partial', async () => {
        const staticHtml = await next.render('/static-to-partial')
        expect(staticHtml).not.toMatch(CLIENT_RENDER_INSTRUCTION)

        await setMode(true)
        const res = await next.fetch('/static-to-partial')
        expectStoredPartialDocument(await res.text())
        expectCacheableByCdn(res.headers)
      })

      it('stores a complete document again once the page turns static', async () => {
        await setMode(true)
        await setMode(false)

        const res = await next.fetch('/static-to-partial')
        const html = await res.text()
        expect(html).not.toMatch(CLIENT_RENDER_INSTRUCTION)
        expectCacheableByCdn(res.headers)

        const { browser, dynamicRSCRequests } = await openPage(
          next,
          '/static-to-partial'
        )
        await expectHydrated(browser)
        expect(await browser.elementById('mode').text()).toBe('static')
        expect(dynamicRSCRequests).toEqual([])
        await expectNoConsoleErrors(browser)
      })

      // A page that was static at build answers RSC requests from its
      // build-time payload, so the refresh never fills the new hole
      // (REPRODUCE_STATIC_PAGE_UPGRADE_BUG). Milestone 2 fixes it.
      // @gate FIXME
      it('fills the hole of a page that turned partial after the build', async () => {
        await setMode(true)
        const { browser } = await openPage(next, '/static-to-partial')
        await expectHydrated(browser)
        await waitForHole(browser)
        await expectNoConsoleErrors(browser)
      })
    })
  })

  describe('outcomes inside holes', () => {
    it('renders not-found UI from a hole, with a 200 document', async () => {
      const res = await next.fetch('/hole-not-found')
      expect(res.status).toBe(200)

      const { browser, documents } = await openPage(next, '/hole-not-found')
      await expectHydrated(browser)
      await waitForHole(browser, 'not-found')
      expect(documents).toHaveLength(1)
    })

    it('follows a redirect from a hole', async () => {
      const { browser, documents } = await openPage(next, '/hole-redirect')
      await retry(async () => {
        expect(await browser.url()).toEndWith('/static')
        expect(await browser.elementById('heading').text()).toBe('Static page')
      }, 10_000)
      expect(documents).toHaveLength(1)
    })

    it('renders the error boundary for a hole that throws', async () => {
      const { browser, documents } = await openPage(next, '/hole-error')
      await expectHydrated(browser)
      await clickCounter(browser, 1)
      // The boundary replaces the page segment, but not the layout above it.
      await waitForHole(browser, 'error')
      expect(await browser.elementById('counter').text()).toBe('Count: 1')
      expect(documents).toHaveLength(1)
    })
  })

  describe('failed refreshes', () => {
    // A failed initial refresh must leave the page as it is, with its
    // fallbacks, instead of reloading it. A reload would only get the same
    // stored document and send the same refresh again.
    async function expectFailedRefreshKeepsFallbacks(
      url: string,
      failRefresh: (route: Playwright.Route) => Promise<void>
    ) {
      await withPage(
        next,
        url,
        {
          waitHydration: false,
          async beforePageLoad(page) {
            await page.route('**/*', async (route) => {
              if (isDynamicRSCRequest(route.request())) {
                await failRefresh(route)
              } else {
                await route.fallback()
              }
            })
          },
        },
        async ({ browser, page, documents, dynamicRSCRequests }) => {
          await retry(async () => {
            expect(dynamicRSCRequests).toHaveLength(1)
          })
          await page.waitForTimeout(RELOAD_SETTLE_MS)
          expect(documents).toHaveLength(1)
          expect(await browser.elementById('fallback').text()).toBe('Loading…')
          await expectHydrated(browser)
          await clickCounter(browser, 1)
        }
      )
    }

    // Until the initial refresh has a guard, a failed one reloads the page
    // in a loop.
    // @gate FIXME
    it('keeps the fallbacks when the refresh cannot connect', async () => {
      await expectFailedRefreshKeepsFallbacks('/partial', (route) =>
        route.abort()
      )
    })

    // A CDN still holding the previous deployment's document.
    // @gate FIXME
    it('keeps the fallbacks when the refresh comes from another deployment', async () => {
      await expectFailedRefreshKeepsFallbacks('/partial', async (route) => {
        const response = await route.fetch()
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            'x-nextjs-deployment-id': 'ppr-cdn-mode-next-deployment',
          },
        })
      })
    })

    // @gate FIXME
    it('keeps the fallbacks when the refresh is not a Flight response', async () => {
      const failures: Array<(route: Playwright.Route) => Promise<void>> = [
        // No content type, like a proxy that drops the headers.
        (route) => route.fulfill({ status: 200, body: '' }),
        (route) =>
          route.fulfill({ status: 500, contentType: 'text/plain', body: '' }),
        // An auth wall in front of the server.
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!DOCTYPE html><p>Please sign in</p>',
          }),
      ]
      for (const failRefresh of failures) {
        await expectFailedRefreshKeepsFallbacks('/partial', failRefresh)
      }
    })

    it('still follows a redirect of the refresh', async () => {
      await withPage(
        next,
        '/partial',
        {
          async beforePageLoad(page) {
            await page.route(
              (url) => url.pathname === '/partial',
              async (route) => {
                if (isDynamicRSCRequest(route.request())) {
                  await route.fulfill({
                    status: 307,
                    headers: { location: '/static' },
                  })
                } else {
                  await route.fallback()
                }
              }
            )
          },
        },
        async ({ browser, page, documents }) => {
          await retry(async () => {
            expect(await browser.url()).toEndWith('/static')
            expect(await browser.elementById('heading').text()).toBe(
              'Static page'
            )
          }, 10_000)
          await page.waitForTimeout(RELOAD_SETTLE_MS)
          expect(documents.length).toBeLessThanOrEqual(2)
        }
      )
    })
  })

  describe('router', () => {
    it('navigates to another partial page and back without a document request', async () => {
      const { browser, documents } = await openPage(next, '/links')
      await expectHydrated(browser)
      await waitForHole(browser)
      await clickCounter(browser, 1)

      await browser.elementById('to-partial-multi').click()
      await waitForHole(browser, 'dynamic-a')
      expect(await browser.elementById('heading').text()).toBe('Multiple holes')

      await browser.back()
      await retry(async () => {
        expect(await browser.elementById('heading').text()).toBe('Links')
      })
      await waitForHole(browser)
      expect(await browser.elementById('counter').text()).toBe('Count: 1')
      expect(documents).toHaveLength(1)
      await expectNoConsoleErrors(browser)
    })

    it('refreshes again only when asked to', async () => {
      const { browser, dynamicRSCRequests } = await openPage(next, '/partial')
      await expectHydrated(browser)
      await waitForHole(browser)
      const first = await browser.elementById('dynamic').text()
      expect(dynamicRSCRequests).toHaveLength(1)

      await browser.eval(() => (window as any).next.router.refresh())
      await retry(async () => {
        expect(await browser.elementById('dynamic').text()).not.toBe(first)
      })
      expect(dynamicRSCRequests).toHaveLength(2)
      await expectNoConsoleErrors(browser)
    })

    it('updates the page from a server action', async () => {
      await expectServerActionUpdatesPage(next)
    })

    // Five navigations later, the router has dropped its hidden copy of the
    // page. Navigating to it again shows the shell it cut from the initial
    // payload at once, and the dynamic request then fills the hole. (Going
    // back through the history instead restores the page from memory, without
    // any request.)
    // A stored document inlines the prerender's own payload, which the
    // router treats as complete, so it cuts no shell from it and the
    // navigation waits for the server.
    // @gate FIXME
    it('shows the shell at once when navigating again to a page the router dropped', async () => {
      const { browser, page } = await openPage(next, '/partial')
      await expectHydrated(browser)
      await waitForHole(browser)
      await clickCounter(browser, 2)
      const firstRender = await browser.elementById('dynamic').text()

      const headings = {
        '/static': 'Static page',
        '/partial-multi': 'Multiple holes',
        '/partial-nested': 'Nested hole',
        '/metadata': 'Dynamic metadata',
        '/links': 'Links',
      }
      for (const [href, heading] of Object.entries(headings)) {
        await browser.eval(
          (url: string) => (window as any).next.router.push(url),
          href
        )
        await retry(async () => {
          expect(await browser.elementById('heading').text()).toBe(heading)
        })
      }

      const hold = await holdRequests(
        page,
        (request) =>
          isDynamicRSCRequest(request) &&
          new URL(request.url()).pathname === '/partial'
      )
      await browser.eval(() => (window as any).next.router.push('/partial'))
      await retry(async () => {
        expect(hold.held).toHaveLength(1)
        expect(await browser.elementById('heading').text()).toBe(
          'Static heading'
        )
      })
      expect(await browser.elementById('fallback').text()).toBe('Loading…')

      hold.release()
      await waitForHole(browser)
      expect(await browser.elementById('dynamic').text()).not.toBe(firstRender)
      expect(await browser.elementById('counter').text()).toBe('Count: 2')
      await expectNoConsoleErrors(browser)
    })
  })

  describe('bots', () => {
    it('renders the whole document on the server for an HTML-limited bot', async () => {
      const res = await next.fetch('/metadata', {
        headers: { 'user-agent': 'Twitterbot' },
      })
      const html = await res.text()
      expect(res.headers.get('cache-control')).toContain('no-store')
      const $ = cheerio.load(html)
      expect($('head title').text()).toMatch(/^Dynamic title \d+$/)
      expect($('#dynamic').text()).toMatch(/^Now: \d+$/)
      expect(html).not.toMatch(CLIENT_RENDER_INSTRUCTION)
    })
  })
})
