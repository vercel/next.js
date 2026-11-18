import { FileRef, PatchedFileRef, nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, gate, retry } from 'next-test-utils'
import type { Page, Response as BrowserResponse } from 'playwright'
import { createRouterAct } from 'router-act'
import { join } from 'node:path'
import { RouteKind } from 'next/dist/server/route-kind'
import { load } from 'cheerio'

describe('fallback-hydration', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({ files: __dirname })

  async function openFallback(
    pathname: string,
    options?: {
      beforePageLoad?: (page: Page) => Promise<void>
      waitHydration?: boolean
    }
  ) {
    let act: ReturnType<typeof createRouterAct> | undefined
    let page: Page | undefined
    let documentResponse: BrowserResponse | undefined
    const requests: Array<{
      segment: string | undefined
      tree: string | undefined
      url: string
    }> = []
    const browser = await next.browser(pathname, {
      pushErrorAsConsoleLog: true,
      waitHydration: options?.waitHydration ?? true,
      async beforePageLoad(browserPage: Page) {
        page = browserPage
        act = createRouterAct(browserPage)
        await options?.beforePageLoad?.(browserPage)
        browserPage.on('response', (response) => {
          if (
            !documentResponse &&
            response.status() === 200 &&
            response.request().isNavigationRequest() &&
            response.request().frame() === browserPage.mainFrame()
          ) {
            documentResponse = response
          }
        })
        browserPage.on('request', (request) => {
          if (request.headers().rsc === '1') {
            requests.push({
              url: request.url(),
              segment: request.headers()['next-router-segment-prefetch'],
              tree: request.headers()['next-router-state-tree'],
            })
          }
        })
      },
    })
    if (!act || !page) {
      throw new Error('The browser did not initialize router request tracking.')
    }
    return { browser, requests, act, page, documentResponse }
  }

  async function prepareDocumentRetry(page: Page, persistent: boolean) {
    const state = { documents: 0, trees: 0 }
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', {
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError')
        },
      })
      if (!history.state?.retryTestInitialized) {
        history.replaceState(
          {
            ...history.state,
            retryTestInitialized: true,
            customState: 'preserved',
          },
          ''
        )
      }
    })
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        state.documents++
      }
    })
    await page.route('**/*', async (route) => {
      if (
        route.request().headers()['next-router-segment-prefetch'] !== '/_tree'
      ) {
        await route.fallback()
        return
      }
      state.trees++
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          ...(persistent || state.trees === 1
            ? { 'x-nextjs-deployment-id': 'fallback-hydration:other-build' }
            : {}),
        },
      })
    })
    return state
  }

  // The retry guard belongs to production fallback bootstrap.
  // @force-gate !dev && cacheComponents
  it('retries a deployment mismatch once', async () => {
    let retryState: Awaited<ReturnType<typeof prepareDocumentRetry>> | undefined
    const { browser, page } = await openFallback(
      '/fallback-hydration/en/products/retry-once',
      {
        waitHydration: false,
        async beforePageLoad(browserPage) {
          retryState = await prepareDocumentRetry(browserPage, false)
        },
      }
    )
    await page.waitForFunction(
      'window.__NEXT_HYDRATED === true && !history.state?.__next_fallback_document_retry'
    )
    expect(retryState).toEqual({ documents: 2, trees: 2 })
    expect(await page.evaluate(() => history.state.customState)).toBe(
      'preserved'
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'en',
      slug: 'retry-once',
    })
    await browser.elementById('counter').click()
    expect(await browser.elementById('counter').text()).toBe('1')
    await assertNoConsoleErrors(browser)
  })

  // The retry guard belongs to production fallback bootstrap.
  // @force-gate !dev && cacheComponents
  it('stops a repeated deployment mismatch', async () => {
    let retryState: Awaited<ReturnType<typeof prepareDocumentRetry>> | undefined
    let failure: Promise<Error> | undefined
    const { page } = await openFallback(
      '/fallback-hydration/en/products/retry-bounded',
      {
        waitHydration: false,
        async beforePageLoad(browserPage) {
          failure = browserPage.waitForEvent('pageerror', {
            predicate: (error) =>
              error.message.includes('could not initialize after reloading'),
          })
          retryState = await prepareDocumentRetry(browserPage, true)
        },
      }
    )
    if (!failure) {
      throw new Error('The bootstrap error observer was not initialized.')
    }
    expect((await failure).message).toContain(
      'could not initialize after reloading'
    )
    await page.waitForLoadState('networkidle')
    expect(retryState).toEqual({ documents: 2, trees: 2 })
    expect(
      await page.evaluate(() => history.state.__next_fallback_document_retry)
    ).toBe(true)
  })

  // The retry guard belongs to production fallback bootstrap.
  // @force-gate !dev && cacheComponents
  it('clears retry state after ordinary hydration before a later retry', async () => {
    let retryState: Awaited<ReturnType<typeof prepareDocumentRetry>> | undefined
    const { browser, page } = await openFallback('/', {
      async beforePageLoad(browserPage) {
        retryState = await prepareDocumentRetry(browserPage, false)
        await browserPage.addInitScript(() => {
          if (!history.state?.retryMarkerSeeded) {
            history.replaceState(
              {
                ...history.state,
                retryMarkerSeeded: true,
                __next_fallback_document_retry: true,
              },
              ''
            )
          }
        })
      },
    })
    await page.waitForFunction(
      'window.__NEXT_HYDRATED === true && !history.state?.__next_fallback_document_retry'
    )
    await page.evaluate((url) => {
      history.replaceState(history.state, '', url)
      location.reload()
    }, `${next.url}/fallback-hydration/en/products/retry-after-normal`)
    await page.waitForFunction(
      'window.__NEXT_HYDRATED === true && document.getElementById("params")?.textContent?.includes("retry-after-normal") && !history.state?.__next_fallback_document_retry'
    )
    expect(retryState).toEqual({ documents: 3, trees: 2 })
    expect(await page.evaluate(() => history.state.customState)).toBe(
      'preserved'
    )
    await browser.elementById('counter').click()
    expect(await browser.elementById('counter').text()).toBe('1')
    await assertNoConsoleErrors(browser)
  })

  it('hydrates client params from inline data and a route tree', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/en/products/shoes?value=inline'
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'en',
      slug: 'shoes',
    })
    expect(await browser.elementById('server-locale').text()).toBe(
      'Server locale: en'
    )
    expect(await browser.elementById('query').text()).toBe('inline')
    expect(await browser.elementById('product-info').text()).toBe(
      'Static product details'
    )
    await browser.elementById('counter').click()
    expect(await browser.elementById('counter').text()).toBe('1')
    expect(await browser.eval('document.title')).toBe('Fallback product')
    if (
      !isNextDev &&
      (await gate((conditions) => conditions.cacheComponents))
    ) {
      expect(await browser.eval('Boolean(window.__NEXT_CLIENT_RESUME)')).toBe(
        true
      )
      expect(requests.some((request) => request.segment === '/_tree')).toBe(
        true
      )
    }
    expect(requests.some((request) => request.segment === '/_full')).toBe(false)
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    await assertNoConsoleErrors(browser)
  })

  it('resolves rewritten params and preserves canonical search params', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/offer/boots?value=rewrite'
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'en',
      slug: 'boots',
    })
    expect(await browser.elementById('query').text()).toBe('rewrite')
    expect(requests.some((request) => request.segment === '/_full')).toBe(false)
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    await assertNoConsoleErrors(browser)
  })

  for (const [mismatch, locale] of [
    ['locale', 'de'],
    ['third', 'fr'],
    ['route', 'en'],
  ]) {
    // Development renders concrete params instead of serving a cached fallback.
    // @force-gate !dev && cacheComponents
    it(`recovers when routing selects ${mismatch}`, async () => {
      const { browser, requests } = await openFallback(
        `/fallback-hydration/offer/${mismatch}?mismatch=${mismatch}`
      )
      expect(await browser.elementById('server-locale').text()).toBe(
        `Server locale: ${locale}`
      )
      expect(JSON.parse(await browser.elementById('params').text())).toEqual({
        locale,
        slug: mismatch,
      })
      expect(
        requests.filter((request) => request.segment === '/_tree')
      ).toHaveLength(1)
      expect(
        requests.filter((request) => request.tree !== undefined)
      ).toHaveLength(1)
      expect(requests.some((request) => request.segment === '/_full')).toBe(
        false
      )
      await browser.elementById('counter').click()
      expect(await browser.elementById('counter').text()).toBe('1')
      expect(await browser.eval('document.title')).toBe(
        mismatch === 'route' ? 'Fallback article' : 'Fallback product'
      )
      await assertNoConsoleErrors(browser)
    })
  }

  for (const [path, slug] of [
    ['c++/plus', 'plus'],
    ['%C3%BCber/encoded-static', 'encoded-static'],
    ['products/blue%2Fshoes', 'blue%2Fshoes'],
    ['catchall/blue/shoes', ['blue', 'shoes']],
    ['optional', undefined],
    ['optional/blue/shoes', ['blue', 'shoes']],
  ] as const) {
    it(`resolves params for ${path}`, async () => {
      const { browser, requests } = await openFallback(
        `/fallback-hydration/en/${path}`
      )
      expect(JSON.parse(await browser.elementById('params').text())).toEqual({
        locale: 'en',
        ...(slug === undefined ? {} : { slug }),
      })
      expect(requests.some((request) => request.tree !== undefined)).toBe(false)
      expect(requests.some((request) => request.segment === '/_full')).toBe(
        false
      )
      await assertNoConsoleErrors(browser)
    })
  }

  // Bootstrap reads the encoded pathname from a production tree response.
  // @force-gate !dev && cacheComponents
  it('hydrates an encoded static segment from routing metadata', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/en/c++/encoded-plus',
      {
        async beforePageLoad(page) {
          await page.route('**/*', async (route) => {
            if (
              route.request().headers()['next-router-segment-prefetch'] !==
              '/_tree'
            ) {
              await route.fallback()
              return
            }
            const response = await route.fetch()
            await route.fulfill({
              response,
              headers: {
                ...response.headers(),
                'x-nextjs-rewritten-path':
                  '/fallback-hydration/en/c%2B%2B/encoded-plus',
              },
            })
          })
        },
      }
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'en',
      slug: 'encoded-plus',
    })
    expect(
      requests.filter((request) => request.segment === '/_tree')
    ).toHaveLength(1)
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    expect(requests.some((request) => request.segment === '/_full')).toBe(false)
    await browser.elementById('counter').click()
    expect(await browser.elementById('counter').text()).toBe('1')
    await assertNoConsoleErrors(browser)
  })

  it('preserves raw query bytes for the routing lookup', async () => {
    const { browser, requests, documentResponse } = await openFallback(
      '/fallback-hydration/offer/raw-query?raw=check&value=a%20b&literal=~&plus=+&encoded=%2B&repeat=one&repeat=two'
    )
    if (!documentResponse) {
      throw new Error('The initial document response was not captured.')
    }
    const documentLocale = load(await documentResponse.text())(
      '#server-locale'
    ).text()
    expect(documentLocale).toMatch(/^Server locale: (en|de)$/)
    expect(await browser.elementById('server-locale').text()).toBe(
      documentLocale
    )
    expect(await browser.elementById('query').text()).toBe('a b')
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    if (
      !isNextDev &&
      (await gate((conditions) => conditions.cacheComponents))
    ) {
      expect(
        requests.filter((request) => request.segment === '/_tree')
      ).toHaveLength(1)
    }
    expect(
      requests
        .filter((request) => request.segment === '/_tree')
        .every((request) =>
          request.url.includes(
            'value=a%20b&literal=~&plus=+&encoded=%2B&repeat=one&repeat=two'
          )
        )
    ).toBe(true)
    await assertNoConsoleErrors(browser)
  })

  // The compatible redirect uses the metadata request of a cached fallback.
  // @force-gate !dev && cacheComponents
  it('retains the fragment after a compatible routing redirect', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/offer/compatible?mismatch=compatible-redirect#product'
    )
    expect(await browser.eval('location.pathname')).toBe(
      '/fallback-hydration/en/products/compatible'
    )
    expect(await browser.eval('location.hash')).toBe('#product')
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    await assertNoConsoleErrors(browser)
  })

  // Bootstrap recovery only runs for production Cache Components fallbacks.
  // @force-gate !dev && cacheComponents
  it('renders the custom global error and styles after fallback recovery', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/offer/global-error?mismatch=third'
    )
    expect(await browser.elementById('server-locale').text()).toBe(
      'Server locale: fr'
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'fr',
      slug: 'global-error',
    })
    expect(
      requests.filter((request) => request.segment === '/_tree')
    ).toHaveLength(1)
    expect(
      requests.filter((request) => request.tree !== undefined)
    ).toHaveLength(1)
    await browser.elementById('counter').click()
    expect(await browser.elementById('counter').text()).toBe('1')
    await assertNoConsoleErrors(browser)

    await browser.elementById('throw-root-error').click()
    expect(await browser.elementById('global-error-title').text()).toBe(
      'Custom fallback recovery error'
    )
    expect(await browser.elementById('global-error-message').text()).toBe(
      'Root failed after fallback recovery'
    )
    await retry(async () => {
      expect(
        await browser
          .elementById('global-error-message')
          .getComputedCss('color')
      ).toBe('rgb(17, 34, 51)')
    })
    expect(await browser.eval('document.getElementById("params")')).toBeNull()
    expect(
      requests.filter((request) => request.tree !== undefined)
    ).toHaveLength(1)
  })

  // Development renders concrete params without a fallback metadata request.
  // @force-gate !dev && cacheComponents
  it('applies a redirect selected by the routing lookup', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/offer/redirect?mismatch=redirect#product'
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'de',
      slug: 'redirected',
    })
    expect(await browser.elementById('server-locale').text()).toBe(
      'Server locale: de'
    )
    expect(await browser.eval('location.pathname')).toBe(
      '/fallback-hydration/de/products/redirected'
    )
    expect(await browser.elementById('query').text()).toBe('redirected')
    expect(await browser.eval('location.hash')).toBe('#product')
    expect(requests.some((request) => request.segment === '/_full')).toBe(false)
    await assertNoConsoleErrors(browser)
  })

  it('hydrates a fallback whose components do not read its params', async () => {
    const { browser, requests } = await openFallback(
      '/fallback-hydration/en/unread/unused'
    )
    expect(await browser.elementById('unread').text()).toBe(
      'Static content without param reads'
    )
    expect(requests.some((request) => request.tree !== undefined)).toBe(false)
    expect(requests.some((request) => request.segment === '/_full')).toBe(false)
    await assertNoConsoleErrors(browser)
  })

  // Route prefetching runs in production modes.
  // @force-gate prefetching
  it('preserves params and metadata when returning after navigation', async () => {
    const { browser, act } = await openFallback(
      '/fallback-hydration/en/products/return'
    )
    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/"]').click()
    })
    await act(async () => {
      await browser.elementByCss('a[href="/"]').click()
    }, 'no-requests')
    await act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/fallback-hydration/en/products/return"]'
          )
          .click()
      },
      (await gate((conditions) => conditions.cacheComponents))
        ? undefined
        : 'no-requests'
    )
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/fallback-hydration/en/products/return"]')
          .click()
      },
      (await gate((conditions) => conditions.cacheComponents))
        ? 'no-requests'
        : undefined
    )
    expect(JSON.parse(await browser.elementById('params').text())).toEqual({
      locale: 'en',
      slug: 'return',
    })
    expect(await browser.eval('document.title')).toBe('Fallback product')
    await assertNoConsoleErrors(browser)
  })

  it('regenerates an ISR page without requiring the full segment', async () => {
    const before = (await next.render$('/fallback-hydration/isr'))(
      '#generation'
    ).text()
    expect(before).not.toBe('')
    const response = await next.fetch('/fallback-hydration/revalidate', {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    let generation = ''
    await retry(async () => {
      const after = (await next.render$('/fallback-hydration/isr'))(
        '#generation'
      ).text()
      expect(after).not.toBe('')
      expect(after).not.toBe(before)
      generation = after
    })
    if (isNextStart) {
      await retry(async () => {
        expect(
          await next.readFile(
            next.getPrerenderFilePath('/fallback-hydration/isr', '.html', {
              route: {
                kind: RouteKind.APP_PAGE,
                sourceRoute: '/fallback-hydration/isr/page',
              },
            })
          )
        ).toContain(generation)
      })
      const metadata = JSON.parse(
        await next.readFile(
          next.getPrerenderFilePath('/fallback-hydration/isr', '.meta', {
            route: {
              kind: RouteKind.APP_PAGE,
              sourceRoute: '/fallback-hydration/isr/page',
            },
          })
        )
      )
      expect(metadata.segmentPaths).not.toContain('/_full')
    }
  })

  // Deployment runs have no local build output to inspect.
  // @force-gate start
  it('omits full segment files from ordinary production output', async () => {
    const cacheComponents = await gate(
      (conditions) => conditions.cacheComponents
    )
    const metadata = JSON.parse(
      await next.readFile(
        cacheComponents
          ? '.next/server/app/fallback-hydration/en/products/[slug].meta'
          : '.next/server/app/index.meta'
      )
    )
    expect(metadata.segmentPaths).toContain('/_tree')
    expect(metadata.segmentPaths).not.toContain('/_full')
  })
})

// The testing API opt-in requires Cache Components.
// @force-gate cacheComponents
describe('fallback-hydration testing API exposure', () => {
  const { next, isNextStart } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'proxy.ts': new FileRef(join(__dirname, 'proxy.ts')),
      'next.config.ts': new PatchedFileRef(
        join(__dirname, 'next.config.ts'),
        (content) =>
          content.replace(
            'experimental: {',
            "experimental: { exposeTestingApiInProductionBuild: process.env.__NEXT_TEST_AXIS !== 'A',"
          )
      ),
    },
  })

  it('keeps full-segment emission consistent during build and regeneration', async () => {
    if (isNextStart) {
      const metadata = JSON.parse(
        await next.readFile('.next/server/app/index.meta')
      )
      expect(metadata.segmentPaths).toContain('/_full')
      expect(await next.readFile('.next/server/app/index.html')).toContain(
        'self.__next_instant_test=fetch'
      )
    }
    const before = (await next.render$('/fallback-hydration/isr'))(
      '#generation'
    ).text()
    expect(
      (await next.fetch('/fallback-hydration/revalidate', { method: 'POST' }))
        .status
    ).toBe(200)
    let generation = ''
    await retry(async () => {
      generation = (await next.render$('/fallback-hydration/isr'))(
        '#generation'
      ).text()
      expect(generation).not.toBe('')
      expect(generation).not.toBe(before)
    })
    if (isNextStart) {
      await retry(async () => {
        expect(
          await next.readFile(
            next.getPrerenderFilePath('/fallback-hydration/isr', '.html', {
              route: {
                kind: RouteKind.APP_PAGE,
                sourceRoute: '/fallback-hydration/isr/page',
              },
            })
          )
        ).toContain(generation)
      })
      const metadata = JSON.parse(
        await next.readFile(
          next.getPrerenderFilePath('/fallback-hydration/isr', '.meta', {
            route: {
              kind: RouteKind.APP_PAGE,
              sourceRoute: '/fallback-hydration/isr/page',
            },
          })
        )
      )
      expect(metadata.segmentPaths).toContain('/_full')
    }
    const segments: string[] = []
    const browser = await next.browser('/', {
      pushErrorAsConsoleLog: true,
      async beforePageLoad(page: Page) {
        await page.context().addCookies([
          {
            name: 'next-instant-navigation-testing',
            value: 'pending',
            url: next.url,
          },
        ])
        page.on('request', (request) => {
          const segment = request.headers()['next-router-segment-prefetch']
          if (segment) {
            segments.push(segment)
          }
        })
      },
    })
    expect(await browser.elementByCss('p').text()).toBe(
      'Fallback hydration hub'
    )
    expect(segments).toContain('/_full')
    await assertNoConsoleErrors(browser)
  })
})
