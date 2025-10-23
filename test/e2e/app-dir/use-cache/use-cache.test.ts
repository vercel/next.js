import { nextTestSetup } from 'e2e-utils'
import {
  assertNoConsoleErrors,
  assertNoErrorToast,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { format } from 'util'
import { Playwright } from 'next-webdriver'
import {
  createRenderResumeDataCache,
  RenderResumeDataCache,
} from 'next/dist/server/resume-data-cache/resume-data-cache'
import { PrerenderManifest } from 'next/dist/build'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

const withCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('use-cache', () => {
  const { next, isNextDev, isNextDeploy, isNextStart, skipped } = nextTestSetup(
    {
      files: __dirname,
      skipDeployment: true,
    }
  )

  if (skipped) {
    return
  }

  it('should cache results', async () => {
    const browser = await next.browser(`/?n=1`)
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=2`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=1&unrelated`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)

    // Client component should have rendered.
    expect(await browser.waitForElementByCss('#z').text()).toBe('foo')

    // Client component child should have rendered but not invalidated the cache.
    expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
  })

  it('should cache results custom handler', async () => {
    const browser = await next.browser(`/custom-handler?n=1`)
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/custom-handler?n=2`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(
      new URL(`/custom-handler?n=1&unrelated`, next.url).toString()
    )
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)

    // Client component child should have rendered but not invalidated the cache.
    expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
  })

  it('should cache complex args', async () => {
    // Use two bytes that can't be encoded as UTF-8 to ensure serialization works.
    const browser = await next.browser('/complex-args?n=a1')
    const a1a = await browser.waitForElementByCss('#x').text()
    expect(a1a.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2a = await browser.waitForElementByCss('#x').text()
    expect(e2a.slice(0, 2)).toBe('e2')

    expect(a1a).not.toBe(e2a)

    await browser.loadPage(new URL('/complex-args?n=a1', next.url).toString())
    const a1b = await browser.waitForElementByCss('#x').text()
    expect(a1b.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2b = await browser.waitForElementByCss('#x').text()
    expect(e2b.slice(0, 2)).toBe('e2')

    // The two navigations to n=1 should use a cached value.
    expect(a1a).toBe(a1b)
    expect(e2a).toBe(e2b)
  })

  it('should dedupe with react cache inside "use cache"', async () => {
    const browser = await next.browser('/react-cache')
    const a = await browser.waitForElementByCss('#a').text()
    const b = await browser.waitForElementByCss('#b').text()
    expect(a).toBe(b)
  })

  it('should return the same object reference for multiple invocations', async () => {
    const browser = await next.browser('/referential-equality')
    expect(await browser.elementById('same-arg').text()).toBe('true')
    expect(await browser.elementById('different-args').text()).toBe('true')
    expect(await browser.elementById('same-bound-arg').text()).toBe('true')
    expect(await browser.elementById('different-bound-args').text()).toBe(
      'true'
    )
  })

  it('should dedupe cached data in the RSC payload', async () => {
    const text = await next
      .fetch('/rsc-payload')
      .then((response) => response.text())

    // The cached data is passed to two client components, but should appear
    // only once in the RSC payload that's included in the HTML document.
    expect(text).toIncludeRepeated(
      '{\\\\"data\\\\":{\\\\"hello\\\\":\\\\"world\\\\"}',
      1
    )
  })

  it('should cache results in route handlers', async () => {
    const response = await next.fetch('/api')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })

  it('should revalidate before redirecting in a route handler', async () => {
    const initialValues = await next.fetch('/api').then((res) => res.json())

    const values = await next
      .fetch('/api/revalidate-redirect')
      .then((res) => res.json())

    if (isNextDeploy) {
      try {
        expect(values).not.toEqual(initialValues)
      } catch {
        // When deployed, we currently don't have a strong guarantee that the
        // revalidations are propagated fully (as we do for redirecting server
        // actions). This is because, for route handlers, the redirect occurs
        // client-side, which prevents us from using the same technique as for
        // server actions, which involves sending a revalidate token as a
        // request header. This token must not leak to the client. However,
        // eventually the revalidation will be propagated, and a refresh should
        // show fresh data.
        await retry(async () => {
          const refreshedValues = await next
            .fetch('/api')
            .then((res) => res.json())

          expect(refreshedValues).not.toEqual(initialValues)
        })
      }
    } else {
      expect(values).not.toEqual(initialValues)
    }
  })

  it('should cache results for cached functions imported from client components', async () => {
    const browser = await next.browser('/imported-from-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/\d\.\d+ \d\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  it('should cache results for cached functions passed to client components', async () => {
    const browser = await next.browser('/passed-to-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/100\.\d+ 100\.\d+ 100\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  it('should update after revalidateTag correctly', async () => {
    const browser = await next.browser('/cache-tag')
    const initial = await browser.elementByCss('#a').text()

    if (!isNextDev) {
      // Bust the ISR cache first, to populate the in-memory cache for the
      // subsequent revalidateTag calls.
      await browser.elementByCss('#revalidate-path').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).not.toBe(initial)
      })
    }

    let valueA = await browser.elementByCss('#a').text()
    let valueB = await browser.elementByCss('#b').text()
    let valueF1 = await browser.elementByCss('#f1').text()
    let valueF2 = await browser.elementByCss('#f2').text()
    let valueR1 = await browser.elementByCss('#r1').text()
    let valueR2 = await browser.elementByCss('#r2').text()

    await browser.elementByCss('#revalidate-a').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
      expect(await browser.elementByCss('#b').text()).toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
    })

    valueA = await browser.elementByCss('#a').text()

    await browser.elementByCss('#revalidate-b').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).toBe(valueA)
      expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
    })

    valueB = await browser.elementByCss('#b').text()

    await browser.elementByCss('#revalidate-c').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
      expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
    })

    valueA = await browser.elementByCss('#a').text()
    valueB = await browser.elementByCss('#b').text()
    valueF1 = await browser.elementByCss('#f1').text()
    valueR1 = await browser.elementByCss('#r1').text()

    await browser.elementByCss('#revalidate-f').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).toBe(valueA)
      expect(await browser.elementByCss('#b').text()).toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
    })

    valueF1 = await browser.elementByCss('#f1').text()

    await browser.elementByCss('#revalidate-r').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).toBe(valueA)
      expect(await browser.elementByCss('#b').text()).toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
    })

    valueR1 = await browser.elementByCss('#r1').text()

    await browser.elementByCss('#revalidate-path').click()
    await retry(async () => {
      expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
      expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
      expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
      expect(await browser.elementByCss('#f2').text()).not.toBe(valueF2)
      expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
      expect(await browser.elementByCss('#r2').text()).not.toBe(valueR2)
    })
  })

  it('should revalidate caches after redirect', async () => {
    const browser = await next.browser('/revalidate-and-redirect')
    const valueA = await browser.elementById('a').text()
    const valueB = await browser.elementById('b').text()

    expect(valueA).toBe(valueB)

    await browser
      .elementByCss('a[href="/revalidate-and-redirect/redirect"]')
      .click()

    await browser.elementById('revalidate-tag-redirect').click()

    const newValueA = await browser.elementById('a').text()
    const newValueB = await browser.elementById('b').text()

    expect(newValueA).toBe(newValueB)
    expect(newValueA).not.toBe(valueA)
    expect(newValueB).toBe(newValueB)

    await browser
      .elementByCss('a[href="/revalidate-and-redirect/redirect"]')
      .click()
    await browser.elementById('revalidate-path-redirect').click()

    const finalValueA = await browser.elementById('a').text()
    const finalValueB = await browser.elementById('b').text()

    expect(finalValueA).not.toBe(newValueA)
    expect(finalValueB).not.toBe(newValueB)
    expect(finalValueB).toBe(finalValueB)
  })

  it('should revalidate caches nested in unstable_cache', async () => {
    const browser = await next.browser('/nested-in-unstable-cache')
    const initial = await browser.elementByCss('p').text()

    if (!isNextDev) {
      // Bust the ISR cache first to populate the "use cache" in-memory cache for
      // the subsequent revalidations.
      await browser.elementByCss('button').click()

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).not.toBe(initial)
      })
    }

    const value = await browser.elementByCss('p').text()

    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe(value)

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).not.toBe(value)
    })
  })

  it('should revalidate caches during on-demand revalidation', async () => {
    const browser = await next.browser('/on-demand-revalidate')
    const initial = await browser.elementById('value').text()

    if (!isNextDev) {
      // Bust the ISR cache first to populate the "use cache" in-memory cache
      // for the subsequent on-demand revalidation.
      await browser.elementById('revalidate-path').click()

      await retry(async () => {
        expect(await browser.elementById('value').text()).not.toBe(initial)
      })
    }

    const value = await browser.elementById('value').text()

    await browser.elementById('revalidate-api-route').click()
    await browser.waitForElementByCss('#revalidate-api-route:enabled')

    await retry(async () => {
      await browser.refresh()
      expect(await browser.elementById('value').text()).not.toBe(value)
    })
  })

  it('should not use stale caches in server actions that have revalidated', async () => {
    const browser = await next.browser('/revalidate-and-use')
    const useCacheValue1 = await browser.elementById('use-cache-value-1').text()
    const useCacheValue2 = await browser.elementById('use-cache-value-2').text()
    const fetchedValue = await browser.elementById('fetched-value').text()

    expect(useCacheValue1).toEqual(useCacheValue2)

    await browser.elementById('revalidate-tag').click()
    await browser.waitForElementByCss('#revalidate-tag:enabled')

    const useCacheValueBeforeRevalidation = await browser
      .elementById('use-cache-value-1')
      .text()
    const useCacheValueAfterRevalidation = await browser
      .elementById('use-cache-value-2')
      .text()
    const newFetchedValue = await browser.elementById('fetched-value').text()

    expect(useCacheValueBeforeRevalidation).toBe(useCacheValue1)
    expect(useCacheValueBeforeRevalidation).toBe(useCacheValue2)
    expect(useCacheValueBeforeRevalidation).not.toBe(
      useCacheValueAfterRevalidation
    )
    expect(newFetchedValue).not.toBe(fetchedValue)

    await browser.elementById('revalidate-path').click()
    await browser.waitForElementByCss('#revalidate-path:enabled')

    expect(await browser.elementById('use-cache-value-1').text()).not.toBe(
      useCacheValueBeforeRevalidation
    )
    expect(await browser.elementById('use-cache-value-2').text()).not.toBe(
      useCacheValueAfterRevalidation
    )
    expect(await browser.elementById('use-cache-value-1').text()).not.toBe(
      await browser.elementById('use-cache-value-2').text()
    )
    expect(await browser.elementById('fetched-value').text()).not.toBe(
      newFetchedValue
    )
  })

  if (isNextStart) {
    it('should prerender fully cacheable pages as static HTML', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      ) as PrerenderManifest

      let prerenderedRoutes = Object.entries(prerenderManifest.routes)

      if (withCacheComponents) {
        // For the purpose of this test we don't consider an incomplete shell.
        prerenderedRoutes = prerenderedRoutes.filter(([pathname, route]) => {
          const filename = pathname.replace(/^\//, '').replace(/^$/, 'index')

          // A prerendered route handler does not have a dataRoute (i.e. RSC).
          if (!route.dataRoute) {
            return true
          }

          return next
            .readFileSync(`.next/server/app/${filename}.html`)
            .endsWith('</html>')
        })
      }

      const prerenderedRouteKeys = prerenderedRoutes
        .map(([routeKey]) => routeKey)
        .sort()

      expect(prerenderedRouteKeys).toEqual(
        [
          '/_not-found',
          // [id] route, first entry in generateStaticParams
          expect.stringMatching(/\/a\d/),
          withCacheComponents && '/api',
          // [id] route, second entry in generateStaticParams
          expect.stringMatching(/\/b\d/),
          '/cache-fetch',
          '/cache-fetch-no-store',
          '/cache-life',
          '/cache-tag',
          '/directive-in-node-modules/with-handler',
          '/directive-in-node-modules/without-handler',
          '/draft-mode/with-cookies',
          '/draft-mode/without-cookies',
          '/form',
          '/imported-from-client',
          '/logs',
          '/method-props',
          '/nested-in-unstable-cache',
          '/not-found',
          '/on-demand-revalidate',
          '/passed-to-client',
          '/react-cache',
          '/referential-equality',
          '/revalidate-and-redirect/redirect',
          '/rsc-payload',
          '/static-class-method',
          withCacheComponents && '/unhandled-promise-regression',
          '/use-action-state',
          '/with-server-action',
        ].filter(Boolean)
      )
    })

    it('should match the expected revalidate and expire configs on the prerender manifest', async () => {
      const { version, routes } = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      ) as PrerenderManifest

      expect(version).toBe(4)

      // custom cache life profile "frequent"
      expect(routes['/cache-life'].initialRevalidateSeconds).toBe(100)
      expect(routes['/cache-life'].initialExpireSeconds).toBe(300)

      if (withCacheComponents) {
        expect(
          routes['/cache-life-with-dynamic'].initialRevalidateSeconds
        ).toBe(100)
        expect(routes['/cache-life-with-dynamic'].initialExpireSeconds).toBe(
          300
        )
      }

      // default expireTime
      expect(routes['/cache-fetch'].initialExpireSeconds).toBe(31536000)

      // The revalidate config from the fetch call should lower the revalidate
      // config for the page.
      expect(routes['/cache-tag'].initialRevalidateSeconds).toBe(42)
    })

    it('should match the expected stale config in the page header', async () => {
      const cacheLifeMeta = JSON.parse(
        await next.readFile('.next/server/app/cache-life.meta')
      )
      expect(cacheLifeMeta.headers['x-nextjs-stale-time']).toBe('19')

      if (withCacheComponents) {
        const cacheLifeWithDynamicMeta = JSON.parse(
          await next.readFile('.next/server/app/cache-life-with-dynamic.meta')
        )
        expect(cacheLifeWithDynamicMeta.headers['x-nextjs-stale-time']).toBe(
          '19'
        )
      }
    })

    it('should send an SWR cache-control header based on the revalidate and expire values', async () => {
      let response = await next.fetch('/cache-life')

      expect(response.headers.get('cache-control')).toBe(
        // revalidate is set to 100, expire is set to 300 => SWR 200
        's-maxage=100, stale-while-revalidate=200'
      )

      response = await next.fetch('/cache-fetch')

      expect(response.headers.get('cache-control')).toBe(
        // revalidate is set to 900, expire is one year (31536000, default
        // expireTime) => SWR 31535100
        's-maxage=900, stale-while-revalidate=31535100'
      )
    })

    if (withCacheComponents) {
      it('should omit dynamic caches from prerendered shells', async () => {
        const browser = await next.browser('/cache-life-with-dynamic', {
          disableJavaScript: true,
        })

        expect(await browser.elementById('y').text()).toBe('Loading...')
      })
    }

    it('should not have hydration errors when resuming a partial shell with dynamic caches', async () => {
      const browser = await next.browser('/cache-life-with-dynamic', {
        pushErrorAsConsoleLog: true,
      })

      await retry(async () => {
        expect(await browser.elementById('y').text()).not.toBe('Loading...')
      })

      // There should be no hydration errors due to a buildtime date being
      // replaced by a new runtime date.
      await assertNoConsoleErrors(browser)
    })

    it('should propagate unstable_cache tags correctly', async () => {
      const meta = JSON.parse(
        await next.readFile('.next/server/app/cache-tag.meta')
      )
      expect(meta.headers['x-next-cache-tags']).toContain('a,c,b,f,r')
    })
  }

  it('can reference server actions in "use cache" functions', async () => {
    const browser = await next.browser('/with-server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should be able to revalidate a page using revalidateTag', async () => {
    const browser = await next.browser(`/form`)
    const time1 = await browser.waitForElementByCss('#t').text()

    await browser.loadPage(new URL(`/form`, next.url).toString())

    const time2 = await browser.waitForElementByCss('#t').text()

    expect(time1).toBe(time2)

    await browser.elementByCss('#refresh').click()

    await retry(async () => {
      const time3 = await browser.waitForElementByCss('#t').text()
      expect(time3).not.toBe(time2)
    })

    // Reloading again should ideally be the same value but because the Action seeds
    // the cache with real params as the argument it has a different cache key.
    // await browser.loadPage(new URL(`/form?c`, next.url).toString())
    // const time4 = await browser.waitForElementByCss('#t').text()
    // expect(time4).toBe(time3);
  })

  it('should use revalidate config in fetch', async () => {
    const browser = await next.browser('/fetch-revalidate')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).not.toBe(initialValue)
  })

  it('should cache fetch without no-store', async () => {
    const browser = await next.browser('/cache-fetch')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  it('should override fetch with no-store in use cache properly', async () => {
    const browser = await next.browser('/cache-fetch-no-store')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  if (isNextStart) {
    // TODO: This is an SSG optimization to share fetch responses during SSG
    // (see #68546). Decide whether we want to keep this feature in the context
    // of "use cache". Alternatively, instead of de-opting entirely, we might
    // want a similar optimization using a build-specific default "use cache"
    // cache handler that utilizes the file system, instead of piggybacking on
    // the incremental cache handler for inner fetches.
    it('should store a fetch response without no-store in the incremental cache handler during build', async () => {
      expect(next.cliOutput).toContain(
        'cache-handler set fetch cache https://next-data-api-endpoint.vercel.app/api/random'
      )
    })

    // The no-store fetch cache option opts the response out of the SSG
    // optimization to share fetch responses within an export worker.
    it('should not store a fetch response with no-store in the incremental cache handler during build', async () => {
      expect(next.cliOutput).not.toContain(
        'cache-handler set fetch cache https://next-data-api-endpoint.vercel.app/api/random?no-store'
      )
    })
  }

  it('should override fetch with cookies/auth in use cache properly', async () => {
    const browser = await next.browser('/cache-fetch-auth-header')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  it('works with useActionState if previousState parameter is not used in "use cache" function', async () => {
    const browser = await next.browser('/use-action-state')

    let value = await browser.elementByCss('p').text()
    expect(value).toBe('-1')

    await browser.elementByCss('button').click()

    await retry(async () => {
      value = await browser.elementByCss('p').text()
      expect(value).toMatch(/\d\.\d+/)
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(value)
    })
  })

  it('works with "use cache" in method props', async () => {
    const browser = await next.browser('/method-props')

    let [value1, value2] = await Promise.all([
      browser.elementByCss('#form-1 p').text(),
      browser.elementByCss('#form-2 p').text(),
    ])

    expect(value1).toBe('-1')
    expect(value2).toBe('-1')

    await browser.elementByCss('#form-1 button').click()

    await retry(async () => {
      value1 = await browser.elementByCss('#form-1 p').text()
      expect(value1).toMatch(/1\.\d+/)
    })

    await browser.elementByCss('#form-2 button').click()

    await retry(async () => {
      value2 = await browser.elementByCss('#form-2 p').text()
      expect(value2).toMatch(/2\.\d+/)
    })

    await browser.elementByCss('#form-1 button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(value1)
    })

    await browser.elementByCss('#form-2 button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(value2)
    })
  })

  it('works with "use cache" in static class methods', async () => {
    const browser = await next.browser('/static-class-method')

    let value = await browser.elementByCss('p').text()

    expect(value).toBe('-1')

    await browser.elementByCss('button').click()

    await retry(async () => {
      value = await browser.elementByCss('p').text()
      expect(value).toMatch(/\d\.\d+/)
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(value)
    })
  })

  it('renders the not-found page when `notFound()` is used', async () => {
    const browser = await next.browser('/not-found')
    const text = await browser.elementByCss('h2').text()
    expect(text).toBe('This page could not be found.')
  })

  describe('should not read nor write cached data when draft mode is enabled', () => {
    it.each([
      {
        description: 'js enabled, with cookies',
        disableJavaScript: false,
        mode: 'with-cookies',
      },
      {
        description: 'js disabled, with cookies',
        disableJavaScript: true,
        mode: 'with-cookies',
      },
      {
        description: 'js enabled, without cookies',
        disableJavaScript: false,
        mode: 'without-cookies',
      },
      {
        description: 'js disabled, without cookies',
        disableJavaScript: true,
        mode: 'without-cookies',
      },
    ])('$description', async ({ disableJavaScript, mode }) => {
      const pathname = `/draft-mode/${mode}`

      const browser = await next.browser(pathname, {
        // This test relies on a server action to set draft mode.
        // To ensure that it works for both fetch actions and MPA actions,
        // we test it with javascript disabled too.
        // (this is because of a bug where draft mode status was not correctly propagated to the workStore for MPA actions)
        disableJavaScript,
        pushErrorAsConsoleLog: true,
      })

      if (isNextDeploy) {
        // Wait for the background revalidation after the deployment to settle.
        const initialTopLevelValue = await browser
          .elementById('top-level')
          .text()

        await retry(async () => {
          await browser.refresh()

          expect(await browser.elementById('top-level').text()).not.toBe(
            initialTopLevelValue
          )
        })
      }

      const refreshAfterServerAction = async () => {
        if (disableJavaScript) {
          // browser.refresh() seems to automatically resubmit POST requests,
          // so if we submitted an MPA action, it'll trigger the action again,
          // which in this case will toggle draftMode again.
          await browser.get(new URL(pathname, next.url).href)
        } else {
          await browser.refresh()
        }
      }

      expect(await browser.elementByCss('button#toggle').text()).toBe(
        'Enable Draft Mode'
      )

      const initialTopLevelValue = await browser.elementById('top-level').text()

      // Draft mode is disabled, cached data should be returned on refresh.

      const initialClosureValue = await browser.elementById('closure').text()

      await browser.refresh()

      expect(await browser.elementById('top-level').text()).toBe(
        initialTopLevelValue
      )
      expect(await browser.elementById('closure').text()).toBe(
        initialClosureValue
      )

      // Enable draft mode.
      await browser.elementByCss('button#toggle').click()

      // When reading cookies, we expect an error.
      // TODO: Ideally this would be a compile-time error.
      if (mode === 'with-cookies') {
        return retry(async () => {
          const logs = await browser.log()

          const expectedErrorMessage = disableJavaScript
            ? 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'
            : isNextDev
              ? 'Route /draft-mode/[mode] used `cookies()` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use `cookies()` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache'
              : GENERIC_RSC_ERROR

          expect(logs).toMatchObject(
            expect.arrayContaining([
              { source: 'error', message: expectedErrorMessage },
            ])
          )
        })
      }

      await browser.waitForElementByCss('button#toggle:enabled')

      expect(await browser.elementByCss('button#toggle').text()).toBe(
        'Disable Draft Mode'
      )

      // Draft mode is now enabled, no cached data should be returned on refresh.

      const newTopLevelValue = await browser.elementById('top-level').text()
      const newClosureValue = await browser.elementById('closure').text()
      console.log(await browser.elementById('top-level').text())

      expect(newTopLevelValue).not.toBe(initialTopLevelValue)
      expect(newClosureValue).not.toBe(initialClosureValue)

      await refreshAfterServerAction()

      expect(await browser.elementById('top-level').text()).not.toBe(
        newTopLevelValue
      )
      console.log(await browser.elementById('top-level').text())

      expect(await browser.elementById('closure').text()).not.toBe(
        newClosureValue
      )

      await browser.elementByCss('button#toggle').click()
      await browser.waitForElementByCss('button#toggle:enabled')

      expect(await browser.elementByCss('button#toggle').text()).toBe(
        'Enable Draft Mode'
      )

      // Draft mode is disabled again, the initially cached data should be
      // returned again.

      console.log(await browser.elementById('top-level').text())

      await refreshAfterServerAction()

      console.log(await browser.elementById('top-level').text())

      expect(await browser.elementById('top-level').text()).toBe(
        initialTopLevelValue
      )
      expect(await browser.elementById('closure').text()).toBe(
        initialClosureValue
      )
    })
  })

  if (isNextDev) {
    if (process.env.__NEXT_CACHE_COMPONENTS !== 'true') {
      it('should not have unhandled rejection of Request data promises when use cache is enabled without cacheComponents', async () => {
        await next.render('/unhandled-promise-regression')
        // We assert both to better defend against changes in error messaging invalidating this test silently.
        // They are today asserting the same thing
        expect(next.cliOutput).not.toContain(
          'During prerendering, `cookies()` rejects when the prerender is complete.'
        )
        expect(next.cliOutput).not.toContain(
          'During prerendering, `headers()` rejects when the prerender is complete.'
        )
        expect(next.cliOutput).not.toContain(
          'During prerendering, `connection()` rejects when the prerender is complete.'
        )
        expect(next.cliOutput).not.toContain('HANGING_PROMISE_REJECTION')
      })
    }

    it('replays logs from "use cache" functions', async () => {
      const browser = await next.browser('/logs')
      const initialLogs = await getSanitizedLogs(browser)

      const expectedOutsideBadge =
        process.env.__NEXT_CACHE_COMPONENTS === 'true' ? 'Prerender' : 'Server'

      // We ignore the logged time string at the end of this message:
      const logMessageWithDateRegexp = /^ Cache {2}deep inside /

      let logMessageWithCachedDate: string | undefined

      await retry(async () => {
        expect(initialLogs).toMatchObject(
          expect.arrayContaining([
            ` ${expectedOutsideBadge}  outside`,
            ' Cache  inside',
            expect.stringMatching(logMessageWithDateRegexp),
          ])
        )

        logMessageWithCachedDate = initialLogs.find((log) =>
          logMessageWithDateRegexp.test(log)
        )

        expect(logMessageWithCachedDate).toBeDefined()
      })

      // Load the page again and expect the cached logs to be replayed again.
      // We're using an explicit `loadPage` instead of `refresh` here, to start
      // with an empty set of logs.
      await browser.loadPage(await browser.url())

      await retry(async () => {
        const newLogs = await getSanitizedLogs(browser)

        expect(newLogs).toMatchObject(
          expect.arrayContaining([
            ` ${expectedOutsideBadge}  outside`,
            ' Cache  inside',
            logMessageWithCachedDate,
          ])
        )
      })
    })
  }

  if (isNextStart && withCacheComponents) {
    it('should exclude inner caches and omitted caches from the resume data cache (RDC)', async () => {
      await next.fetch('/rdc')

      const resumeDataCache = extractResumeDataCacheFromPostponedState(
        JSON.parse(await next.readFile('.next/server/app/rdc.meta')).postponed
      )

      const cacheKeys = Array.from(resumeDataCache.cache.keys())

      // There should be no cache entry for the "middle" cache function, because
      // it's only used inside another cache scope ("outer"). Whereas "inner" is
      // also used inside a prerender scope (the page). Additionally, there
      // should also be no cache entry for "short", because it has a short
      // lifetime and is subsequently omitted from the prerendered shell. The
      // following expectation is matching on the full list. If any additional
      // keys are found, the test will fail and print the unexpected keys.
      expect(cacheKeys).toMatchObject([
        // Note: We're matching on the args that are encoded into the respective
        // cache keys.
        expect.stringContaining('["outer"]'),
        expect.stringContaining('["inner"]'),
        ...(withCacheComponents
          ? []
          : // With legacy PPR, the "short" cache is included in the prerendered
            // shell.
            [expect.stringContaining('[{"id":"short"},"$undefined"]]')]),
      ])
    })
  }

  describe('usage in node_modules', () => {
    it('should cache results when using a directive without a handler', async () => {
      const browser = await next.browser(
        '/directive-in-node-modules/without-handler'
      )
      const randomOne = await browser.elementByCss('#one').text()
      const randomTwo = await browser.elementByCss('#two').text()
      expect(randomOne).toBe(randomTwo)
    })
    it('should cache results when using a directive with a handler', async () => {
      const browser = await next.browser(
        '/directive-in-node-modules/with-handler'
      )
      const randomOne = await browser.elementByCss('#one').text()
      const randomTwo = await browser.elementByCss('#two').text()
      expect(randomOne).toBe(randomTwo)
    })
  })

  it('shares caches between the page/layout and generateMetadata', async () => {
    const browser = await next.browser('/generate-metadata')
    const layoutData = await browser.elementByCss('#layout-data').text()
    const pageData = await browser.elementByCss('#page-data').text()
    const title = await browser.eval('document.title')

    expect(layoutData).toBe(pageData)
    expect(pageData).toBe(title)

    const initialDescription = await browser
      .elementByCss('meta[name="description"]')
      .getAttribute('content')

    expect(initialDescription).not.toBe(title)

    await browser.refresh()

    const description = await browser
      .elementByCss('meta[name="description"]')
      .getAttribute('content')

    // TODO: After #78703 has landed, we can enable the outer 'use cache' in
    // generateMetadata, and still have the cached title (a nested cache) be
    // shared with the page/layout. Then the description will also be cached (by
    // the outer 'use cache'), and this expectation needs to be flipped.
    expect(description).not.toBe(initialDescription)
  })

  if (withCacheComponents) {
    it('can resume a cached generateMetadata function', async () => {
      // First load the page with JavaScript disabled, to ensure that the
      // generateMetadata result was included in the prerendered shell.
      let browser = await next.browser('/generate-metadata-resume/nested', {
        disableJavaScript: true,
      })

      // The title must be in the head if it was prerendered.
      const title = await browser
        .elementByCss('head title', { state: 'attached' })
        .text()
      expect(title).toBeDateString()

      await browser.close()

      // Load the page again, now with JavaScript enabled.
      browser = await next.browser('/generate-metadata-resume/nested')

      // If there was no cache hit from the RDC during the resume, we'd observe
      // a different title.
      expect(await browser.eval('document.title')).toBe(title)
    })

    // TODO(restart-on-cache-miss):
    // in dev, cached Page components and generateMetadata can end up delayed into the dynamic stage
    // even if they don't read params. This is because the `params` promise is delayed a task (for staging purposes),
    // and thus encoding the cache key takes a task (but is not itself tracked as a cache read).
    // If this happens, then we won't see a cache miss, and don't wait for caches to warm,
    // so they'll end up delayed, like they're not cached at all.
    // This breaks the tests expectations about what's in the static shell, so we're skipping it in dev for now.
    if (!isNextDev) {
      it('can resume a cached generateMetadata function that does not read params', async () => {
        // First load the page with JavaScript disabled, to ensure that the
        // generateMetadata result was included in the prerendered shell.
        let browser = await next.browser(
          '/generate-metadata-resume/params-unused/foo',
          { disableJavaScript: true }
        )

        // The metadata must be in the head if it was prerendered.
        const title = await browser
          .elementByCss('head title', { state: 'attached' })
          .text()
        expect(title).toBeDateString()
        const description = await browser
          .elementByCss('head meta[name="description"]', { state: 'attached' })
          .getAttribute('content')
        expect(description).toBeDateString()

        await browser.close()

        // Load the page again, now with JavaScript enabled.
        browser = await next.browser(
          '/generate-metadata-resume/params-unused/foo'
        )

        // If there was no cache hit from the RDC during the resume, we'd observe
        // different metadata.
        const title2 = await browser.eval('document.title')
        const description2 = await browser
          // Select the last meta element, in case another one was added during
          // the resume due to a cache miss.
          .elementByCss('meta[name="description"]:last-of-type')
          .getAttribute('content')

        if (isNextDev) {
          expect(title2).toBe(title)
          expect(description2).toBe(description)
        } else {
          // TODO: Omitting unused params from cache keys (and upgrading cache
          // keys when they are used) is not yet implemented. Remove this else
          // branch once it is.
          expect(title2).not.toBe(title)
          expect(description2).not.toBe(description)
        }
      })
    }

    it('can serialize parent metadata as generateMetadata argument', async () => {
      const browser = await next.browser('/generate-metadata-resume/nested')

      // The metadata must be in the head if it was prerendered.
      const canonicalUrl = await browser
        .elementByCss('head link[rel="canonical"]', { state: 'attached' })
        .getAttribute('href')

      expect(canonicalUrl).toBe('https://example.com/baz/qux')

      // There should be no timeout error.
      await assertNoErrorToast(browser)
    })

    it('makes a cached generateMetadata function that implicitly depends on params dynamic during prerendering', async () => {
      // First load the page with JavaScript disabled, to ensure that no
      // generateMetadata result was included in the prerendered shell.
      let browser = await next.browser(
        '/generate-metadata-resume/canonical/foo',
        { disableJavaScript: true }
      )

      // The metadata would be in the head if it was prerendered.
      expect(
        await browser
          .elementByCss('head', { state: 'attached' })
          .hasElementByCss('link[rel="canonical"]')
      ).toBe(false)

      // However, it should have been added to the body during the resume.
      expect(
        await browser.elementByCss('link[rel="canonical"]').getAttribute('href')
      ).toBe('https://example.com/baz/qux')

      await browser.close()

      // Load the page again, now with JavaScript enabled.
      browser = await next.browser('/generate-metadata-resume/canonical/foo')

      // There should be no timeout error.
      await assertNoErrorToast(browser)
    })

    it('makes a cached generateMetadata function that reads params dynamic during prerendering', async () => {
      // First load the page with JavaScript disabled, to ensure that no
      // generateMetadata result was included in the prerendered shell.
      let browser = await next.browser(
        '/generate-metadata-resume/params-used/foo',
        { disableJavaScript: true }
      )

      // The metadata would be in the head if it was prerendered.
      expect(
        await browser
          .elementByCss('head', { state: 'attached' })
          .hasElementByCss('title')
      ).toBe(false)
      expect(
        await browser
          .elementByCss('head', { state: 'attached' })
          .hasElementByCss('meta[name="description"]')
      ).toBe(false)

      // However, it should have been added to the body during the resume.
      const title = await browser.eval('document.title')
      expect(title).toBeDefined()
      expect(title).toBeDateString()
      const description = await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
      expect(description).toBeDateString()

      await browser.close()

      // Load the page again, now with JavaScript enabled.
      browser = await next.browser('/generate-metadata-resume/params-used/foo')

      // We should see the same cached metadata again.
      expect(await browser.eval('document.title')).toBe(title)
      expect(
        await browser
          .elementByCss('meta[name="description"]')
          .getAttribute('content')
      ).toBe(description)
    })

    it('can resume a cached generateViewport function', async () => {
      // First load the page with JavaScript disabled, to ensure that the
      // generateViewport result was included in the prerendered shell.
      let browser = await next.browser('/generate-viewport-resume', {
        disableJavaScript: true,
      })

      // The meta tag must be in the head if it was prerendered.
      const viewport = await browser
        .elementByCss('head meta[name="viewport"]', { state: 'attached' })
        .getAttribute('content')
      const [, initialScale] = viewport.match(/initial-scale=([\d.]+)/) ?? []
      expect(Number(initialScale)).toBeNumber()
      await browser.close()

      // Load the page again, now with JavaScript enabled.
      browser = await next.browser('/generate-viewport-resume')

      // If there was no cache hit from the RDC during the resume, we'd observe
      // a different value.
      const viewport2 = await browser
        // Select the last meta element, in case another one was added during
        // the resume due to a cache miss.
        .elementByCss('meta[name="viewport"]:last-of-type', {
          state: 'attached',
        })
        .getAttribute('content')
      const [, initialScale2] = viewport2.match(/initial-scale=([\d.]+)/) ?? []
      expect(initialScale2).toBe(initialScale)
    })

    it('can resume a cached generateViewport function that does not read params', async () => {
      // First load the page with JavaScript disabled, to ensure that the
      // generateViewport result was included in the prerendered shell.
      let browser = await next.browser(
        '/generate-viewport-resume/params-unused/red',
        { disableJavaScript: true }
      )

      // The meta tag must be in the head if it was prerendered.
      const viewport = await browser
        .elementByCss('head meta[name="viewport"]', { state: 'attached' })
        .getAttribute('content')
      const [, initialScale, maximumScale] =
        viewport.match(/initial-scale=([\d.]+), maximum-scale=([\d.]+)/) ?? []
      expect(Number(initialScale)).toBeNumber()
      expect(Number(maximumScale)).toBeNumber()

      await browser.close()

      // Load the page again, now with JavaScript enabled.
      browser = await next.browser(
        '/generate-viewport-resume/params-unused/red'
      )

      // If there was no cache hit from the RDC during the resume, we'd observe
      // a different meta tag.
      const viewport2 = await browser
        // Select the last meta element, in case another one was added during
        // the resume due to a cache miss.
        .elementByCss('meta[name="viewport"]:last-of-type', {
          state: 'attached',
        })
        .getAttribute('content')
      const [, initialScale2, maximumScale2] =
        viewport2.match(/initial-scale=([\d.]+), maximum-scale=([\d.]+)/) ?? []

      if (isNextDev) {
        expect(initialScale2).toBe(initialScale)
        expect(maximumScale2).toBe(maximumScale)
      } else {
        // TODO: Omitting unused params from cache keys (and upgrading cache
        // keys when they are used) is not yet implemented. Remove this else
        // branch once it is.
        expect(initialScale2).not.toBe(initialScale)
        expect(maximumScale2).not.toBe(maximumScale)
      }
    })

    it('makes a cached generateViewport function that reads params dynamic during prerendering', async () => {
      // The page is fully dynamic, so we can only observe that the values are
      // cached on subsequent requests.
      let browser = await next.browser(
        '/generate-viewport-resume/params-used/red'
      )

      const viewport = await browser
        .elementByCss('meta[name="viewport"]', { state: 'attached' })
        .getAttribute('content')
      const [, initialScale, maximumScale] =
        viewport.match(/initial-scale=([\d.]+), maximum-scale=([\d.]+)/) ?? []
      expect(Number(initialScale)).toBeNumber()
      expect(Number(maximumScale)).toBeNumber()

      await browser.refresh()

      const viewport2 = await browser
        .elementByCss('meta[name="viewport"]', { state: 'attached' })
        .getAttribute('content')
      const [, initialScale2, maximumScale2] =
        viewport2.match(/initial-scale=([\d.]+), maximum-scale=([\d.]+)/) ?? []
      expect(initialScale2).toBe(initialScale)
      expect(maximumScale2).toBe(maximumScale)
    })
  }
})

async function getSanitizedLogs(browser: Playwright): Promise<string[]> {
  const logs = await browser.log({ includeArgs: true })

  return logs.map(({ args }) =>
    format(
      ...args.map((arg) => (typeof arg === 'string' ? stripAnsi(arg) : arg))
    )
  )
}

function extractResumeDataCacheFromPostponedState(
  state: string
): RenderResumeDataCache {
  const postponedStringLengthMatch = state.match(/^([0-9]*):/)![1]
  const postponedStringLength = parseInt(postponedStringLengthMatch)

  return createRenderResumeDataCache(
    state.slice(postponedStringLengthMatch.length + postponedStringLength + 1)
  )
}
