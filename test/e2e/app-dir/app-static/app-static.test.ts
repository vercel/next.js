import globOrig from 'glob'
import cheerio from 'cheerio'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import {
  check,
  fetchViaHTTP,
  normalizeRegEx,
  retry,
  waitFor,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const glob = promisify(globOrig)

describe('app-dir static/dynamic handling', () => {
  const { next, isNextDev, isNextStart, isNextDeploy, isTurbopack } =
    nextTestSetup({
      files: __dirname,
      env: {
        NEXT_DEBUG_BUILD: '1',
        ...(process.env.CUSTOM_CACHE_HANDLER
          ? {
              CUSTOM_CACHE_HANDLER: process.env.CUSTOM_CACHE_HANDLER,
            }
          : {}),
      },
    })

  let prerenderManifest
  let buildCliOutputIndex = 0

  beforeAll(async () => {
    if (isNextStart) {
      prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      buildCliOutputIndex = next.cliOutput.length
    }
  })

  if (!process.env.__NEXT_CACHE_COMPONENTS) {
    it('should respond correctly for dynamic route with dynamicParams false in layout', async () => {
      const res = await next.fetch('/partial-params-false/en/another')
      expect(res.status).toBe(200)
    })

    it('should respond correctly for partially dynamic route with dynamicParams false in layout', async () => {
      const res = await next.fetch('/partial-params-false/en/static')
      expect(res.status).toBe(200)
    })
  }

  it('should use auto no cache when no fetch config', async () => {
    const res = await next.fetch('/no-config-fetch')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)
    const data = $('#data').text()

    expect(data).toBeTruthy()

    const res2 = await next.fetch('/no-config-fetch')
    const html2 = await res2.text()
    const data2 = cheerio.load(html2)('#data').text()

    if (isNextDev) {
      expect(data).not.toBe(data2)
    } else {
      const pageCache = (
        res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache')
      ).toLowerCase()

      expect(pageCache).toBeTruthy()
      expect(pageCache).not.toBe('MISS')
      expect(data).toBe(data2)
    }
  })

  it('should correctly handle "default" cache statuses', async () => {
    const res = await next.fetch('/default-config-fetch')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)
    const data = $('#data').text()

    expect(data).toBeTruthy()

    const res2 = await next.fetch('/default-config-fetch')
    const html2 = await res2.text()
    const data2 = cheerio.load(html2)('#data').text()

    if (isNextDev) {
      expect(data).not.toBe(data2)
    } else {
      // "default" cache does not impact ISR handling on a page, similar to the above test
      // case for no fetch config
      const pageCache = (
        res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache')
      ).toLowerCase()

      expect(pageCache).toBeTruthy()
      expect(pageCache).not.toBe('MISS')
      expect(data).toBe(data2)
    }

    // route handlers should not automatically cache fetches with "default" cache
    const routeRes = await next.fetch('/default-config-fetch/api')
    const initialRouteData = (await routeRes.json()).data

    const nextRes = await next.fetch('/default-config-fetch/api')
    const newRouteData = (await nextRes.json()).data

    expect(initialRouteData).not.toEqual(newRouteData)
  })

  it('should still cache even though the W3C trace context headers `traceparent` and `tracestate` were different', async () => {
    const res = await next.fetch('/strip-w3c-trace-context-headers')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    const traceparent1 = $('#traceparent1').text()
    const traceparent2 = $('#traceparent2').text()
    const tracestate1 = $('#tracestate1').text()
    const tracestate2 = $('#tracestate2').text()
    expect(traceparent1).toBeTruthy()
    expect(traceparent1).toBe(traceparent2)
    expect(tracestate1).toBeTruthy()
    expect(tracestate1).toBe(tracestate2)

    const echoedHeaders = JSON.parse($('#echoedHeaders').text())
    expect(echoedHeaders.headers.traceparent).toEqual('A')
    expect(echoedHeaders.headers.tracestate).toEqual('A')
  })

  // Runtime logs aren't queryable in deploy mode
  if (!isNextDeploy) {
    it('should warn for too many cache tags', async () => {
      const res = await next.fetch('/too-many-cache-tags')
      expect(res.status).toBe(200)
      await retry(() => {
        expect(next.cliOutput).toContain('exceeded max tag count for')
        expect(next.cliOutput).toContain('tag-129')
      })
    })
  }

  if (isNextDeploy) {
    describe('new tags have been specified on subsequent fetch', () => {
      it('should not fetch from memory cache', async () => {
        const res1 = await next.fetch('/specify-new-tags/one-tag')
        expect(res1.status).toBe(200)

        const res2 = await next.fetch('/specify-new-tags/two-tags')
        expect(res2.status).toBe(200)

        const html1 = await res1.text()
        const html2 = await res2.text()
        const $1 = cheerio.load(html1)
        const $2 = cheerio.load(html2)

        const data1 = $1('#page-data').text()
        const data2 = $2('#page-data').text()
        expect(data1).not.toBe(data2)
      })

      it('should not fetch from memory cache after revalidateTag is used', async () => {
        const res1 = await next.fetch('/specify-new-tags/one-tag')
        expect(res1.status).toBe(200)

        const revalidateRes = await next.fetch(
          '/api/revalidate-tag-node?tag=thankyounext'
        )
        expect((await revalidateRes.json()).revalidated).toBe(true)

        const res2 = await next.fetch('/specify-new-tags/two-tags')
        expect(res2.status).toBe(200)

        const html1 = await res1.text()
        const html2 = await res2.text()
        const $1 = cheerio.load(html1)
        const $2 = cheerio.load(html2)

        const data1 = $1('#page-data').text()
        const data2 = $2('#page-data').text()
        expect(data1).not.toBe(data2)
      })
    })
  }

  if (isNextStart) {
    it('should propagate unstable_cache tags correctly', async () => {
      const meta = JSON.parse(
        await next.readFile(
          '.next/server/app/variable-revalidate/revalidate-360-isr.meta'
        )
      )
      expect(meta.headers['x-next-cache-tags']).toContain('unstable_cache_tag1')
    })

    it('should infer a fetchCache of force-no-store when force-dynamic is used', async () => {
      const $ = await next.render$('/force-dynamic-fetch-cache/no-fetch-cache')
      const initData = $('#data').text()
      await retry(async () => {
        const $2 = await next.render$(
          '/force-dynamic-fetch-cache/no-fetch-cache'
        )
        expect($2('#data').text()).toBeTruthy()
        expect($2('#data').text()).not.toBe(initData)
      })

      // Check route handlers as well
      const initFetchData = await (
        await next.fetch('/force-dynamic-fetch-cache/no-fetch-cache/route')
      ).json()

      await retry(async () => {
        const newFetchData = await (
          await next.fetch('/force-dynamic-fetch-cache/no-fetch-cache/route')
        ).json()
        expect(newFetchData).toBeTruthy()
        expect(newFetchData).not.toEqual(initFetchData)
      })
    })

    it('should infer a fetch cache of "force-cache" when force-dynamic is used on a fetch with revalidate', async () => {
      let currentData: string | undefined
      await retry(async () => {
        const $ = await next.render$('/force-dynamic-fetch-cache/revalidate')
        const initialData = $('#data').text()
        expect($('#data').text()).toBeTruthy()

        const $2 = await next.render$('/force-dynamic-fetch-cache/revalidate')
        currentData = $2('#data').text()
        expect(currentData).toBeTruthy()
        expect(currentData).toBe(initialData)
      })

      // wait for revalidation
      await waitFor(3000)
      await retry(async () => {
        const $3 = await next.render$('/force-dynamic-fetch-cache/revalidate')
        const finalValue = $3('#data').text()
        expect(finalValue).toBeTruthy()
        expect(finalValue).not.toBe(currentData)
      })
    })

    it('force-dynamic should supercede a "default" cache value', async () => {
      const $ = await next.render$('/force-dynamic-fetch-cache/default-cache')
      const initData = $('#data').text()
      await retry(async () => {
        const $2 = await next.render$(
          '/force-dynamic-fetch-cache/default-cache'
        )
        expect($2('#data').text()).toBeTruthy()
        expect($2('#data').text()).not.toBe(initData)
      })

      // Check route handlers as well
      const initFetchData = await (
        await next.fetch('/force-dynamic-fetch-cache/default-cache/route')
      ).json()

      await retry(async () => {
        const newFetchData = await (
          await next.fetch('/force-dynamic-fetch-cache/default-cache/route')
        ).json()
        expect(newFetchData).toBeTruthy()
        expect(newFetchData).not.toEqual(initFetchData)
      })
    })

    it('fetchCache config should supercede dynamic config when force-dynamic is used', async () => {
      const $ = await next.render$(
        '/force-dynamic-fetch-cache/with-fetch-cache'
      )
      const initData = $('#data').text()
      await retry(async () => {
        const $2 = await next.render$(
          '/force-dynamic-fetch-cache/with-fetch-cache'
        )
        expect($2('#data').text()).toBeTruthy()
        expect($2('#data').text()).toBe(initData)
      })

      // Check route handlers as well
      const initFetchData = await (
        await next.fetch('/force-dynamic-fetch-cache/with-fetch-cache/route')
      ).json()

      await retry(async () => {
        const newFetchData = await (
          await next.fetch('/force-dynamic-fetch-cache/with-fetch-cache/route')
        ).json()
        expect(newFetchData).toBeTruthy()
        expect(newFetchData).toEqual(initFetchData)
      })
    })

    it('fetch `cache` should supercede dynamic config when force-dynamic is used', async () => {
      const $ = await next.render$('/force-dynamic-fetch-cache/force-cache')
      const initData = $('#data').text()
      await retry(async () => {
        const $2 = await next.render$('/force-dynamic-fetch-cache/force-cache')
        expect($2('#data').text()).toBeTruthy()
        expect($2('#data').text()).toBe(initData)
      })

      // Check route handlers as well
      const initFetchData = await (
        await next.fetch('/force-dynamic-fetch-cache/force-cache/route')
      ).json()

      await retry(async () => {
        const newFetchData = await (
          await next.fetch('/force-dynamic-fetch-cache/force-cache/route')
        ).json()
        expect(newFetchData).toBeTruthy()
        expect(newFetchData).toEqual(initFetchData)
      })
    })

    if (!process.env.CUSTOM_CACHE_HANDLER) {
      it('should honor force-static with fetch cache: no-store correctly', async () => {
        const res = await next.fetch('/force-static-fetch-no-store')
        expect(res.status).toBe(200)
        expect(res.headers.get('x-nextjs-cache')?.toLowerCase()).toBe('hit')
      })
    }
  }

  it('should correctly include headers instance in cache key', async () => {
    const res = await next.fetch('/variable-revalidate/headers-instance')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    const data1 = $('#page-data').text()
    const data2 = $('#page-data2').text()
    expect(data1).not.toBe(data2)

    expect(data1).toBeTruthy()
    expect(data2).toBeTruthy()
  })

  it.skip.each([
    {
      path: '/react-fetch-deduping-node',
    },
    {
      path: '/react-fetch-deduping-edge',
    },
  ])(
    'should correctly de-dupe fetch without next cache $path',
    async ({ path }) => {
      for (let i = 0; i < 5; i++) {
        const res = await next.fetch(path, {
          redirect: 'manual',
        })

        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        const data1 = $('#data-1').text()
        const data2 = $('#data-2').text()

        expect(data1).toBeTruthy()
        expect(data1).toBe(data2)

        await waitFor(250)
      }
    }
  )

  it.each([
    { pathname: '/unstable-cache-node' },
    { pathname: '/unstable-cache-edge' },
    { pathname: '/api/unstable-cache-node' },
    { pathname: '/api/unstable-cache-edge' },
  ])('unstable-cache should work in pages$pathname', async ({ pathname }) => {
    let res = await next.fetch(pathname)
    expect(res.status).toBe(200)
    const isApi = pathname.startsWith('/api')
    let prevData

    if (isApi) {
      prevData = await res.json()
    } else {
      const $ = isApi ? undefined : cheerio.load(await res.text())
      prevData = JSON.parse($('#props').text())
    }

    expect(prevData.data.random).toBeTruthy()

    await retry(async () => {
      res = await next.fetch(pathname)
      expect(res.status).toBe(200)

      let curData
      if (isApi) {
        curData = await res.json()
      } else {
        const $ = cheerio.load(await res.text())
        curData = JSON.parse($('#props').text())
      }

      try {
        expect(curData.data.random).toBeTruthy()
        expect(curData.data.random).toBe(prevData.data.random)
      } finally {
        prevData = curData
      }
    })
  })

  it('should not have cache tags header for non-minimal mode', async () => {
    for (const path of [
      '/ssr-forced',
      '/ssr-forced',
      '/variable-revalidate/revalidate-3',
      '/variable-revalidate/revalidate-360',
      '/variable-revalidate/revalidate-360-isr',
    ]) {
      const res = await fetchViaHTTP(next.url, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBeFalsy()
    }
  })

  if (isNextDev) {
    it('should error correctly for invalid params from generateStaticParams', async () => {
      await next.patchFile(
        'app/invalid/[slug]/page.js',
        `
          export function generateStaticParams() {
            return [{slug: { invalid: true }}]
          }
        `
      )

      // The page may take a moment to compile, so try it a few times.
      await check(async () => {
        return next.render('/invalid/first')
      }, /A required parameter \(slug\) was not provided as a string received object/)

      await next.deleteFile('app/invalid/[slug]/page.js')
    })

    it('should correctly handle multi-level generateStaticParams when some levels are missing', async () => {
      const browser = await next.browser('/flight/foo/bar')
      const v = ~~(Math.random() * 1000)
      await browser.eval(`document.cookie = "test-cookie=${v}"`)
      await browser.elementByCss('button').click()
      await check(async () => {
        return await browser.elementByCss('h1').text()
      }, v.toString())
    })
  }

  it('should correctly skip caching POST fetch for POST handler', async () => {
    const res = await next.fetch('/route-handler/post', {
      method: 'POST',
    })
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data).toBeTruthy()

    for (let i = 0; i < 5; i++) {
      const res2 = await next.fetch('/route-handler/post', {
        method: 'POST',
      })
      expect(res2.status).toBe(200)
      const newData = await res2.json()
      expect(newData).toBeTruthy()
      expect(newData).not.toEqual(data)
    }
  })

  if (!isNextDev && !process.env.CUSTOM_CACHE_HANDLER) {
    // TODO: Temporarily disabling this test for Turbopack. The test is failing
    // quite often (see https://app.datadoghq.com/ci/test-runs?query=test_level%3Atest%20env%3Aci%20%40git.repository.id%3Agithub.com%2Fvercel%2Fnext.js%20%40test.service%3Anextjs%20%40test.status%3Afail%20%40test.name%3A%22app-dir%20static%2Fdynamic%20handling%20should%20properly%20revalidate%20a%20route%20handler%20that%20triggers%20dynamic%20usage%20with%20force-static%22&agg_m=count&agg_m_source=base&agg_t=count&currentTab=overview&eventStack=&fromUser=false&index=citest&start=1720993078523&end=1728769078523&paused=false).
    // Since this is also reproducible when manually recreating the scenario, it
    // might actually be a bug with ISR, which needs to be investigated.
    if (!isTurbopack) {
      it('should properly revalidate a route handler that triggers dynamic usage with force-static', async () => {
        // wait for the revalidation period
        let res = await next.fetch('/route-handler/no-store-force-static')

        let data = await res.json()
        // grab the initial timestamp
        const initialTimestamp = data.now

        // confirm its cached still
        res = await next.fetch('/route-handler/no-store-force-static')

        data = await res.json()

        expect(data.now).toBe(initialTimestamp)

        // wait for the revalidation time
        await waitFor(3000)

        // verify fresh data
        res = await next.fetch('/route-handler/no-store-force-static')
        data = await res.json()

        expect(data.now).not.toBe(initialTimestamp)
      })
    }
  }

  if (!process.env.CUSTOM_CACHE_HANDLER) {
    it.each([
      {
        type: 'edge route handler',
        revalidateApi: '/api/revalidate-tag-edge',
      },
      {
        type: 'node route handler',
        revalidateApi: '/api/revalidate-tag-node',
      },
    ])(
      'it should revalidate tag correctly with $type',
      async ({ revalidateApi }) => {
        const initRes = await next.fetch('/variable-revalidate/revalidate-360')
        const html = await initRes.text()
        const $ = cheerio.load(html)
        const initLayoutData = $('#layout-data').text()
        const initPageData = $('#page-data').text()
        const initNestedCacheData = $('#nested-cache').text()

        const routeHandlerRes = await next.fetch(
          '/route-handler/revalidate-360'
        )
        const initRouteHandlerData = await routeHandlerRes.json()

        const edgeRouteHandlerRes = await next.fetch(
          '/route-handler-edge/revalidate-360'
        )
        const initEdgeRouteHandlerRes = await edgeRouteHandlerRes.json()

        expect(initLayoutData).toBeTruthy()
        expect(initPageData).toBeTruthy()

        await check(async () => {
          const revalidateRes = await next.fetch(
            `${revalidateApi}?tag=thankyounext`
          )
          expect((await revalidateRes.json()).revalidated).toBe(true)

          const newRes = await next.fetch('/variable-revalidate/revalidate-360')
          const cacheHeader = newRes.headers.get('x-nextjs-cache')

          if ((global as any).isNextStart && cacheHeader) {
            expect(cacheHeader).toBe('MISS')
          }
          const newHtml = await newRes.text()
          const new$ = cheerio.load(newHtml)
          const newLayoutData = new$('#layout-data').text()
          const newPageData = new$('#page-data').text()
          const newNestedCacheData = new$('#nested-cache').text()

          const newRouteHandlerRes = await next.fetch(
            '/route-handler/revalidate-360'
          )
          const newRouteHandlerData = await newRouteHandlerRes.json()

          const newEdgeRouteHandlerRes = await next.fetch(
            '/route-handler-edge/revalidate-360'
          )
          const newEdgeRouteHandlerData = await newEdgeRouteHandlerRes.json()

          expect(newLayoutData).toBeTruthy()
          expect(newPageData).toBeTruthy()
          expect(newRouteHandlerData).toBeTruthy()
          expect(newEdgeRouteHandlerData).toBeTruthy()
          expect(newLayoutData).not.toBe(initLayoutData)
          expect(newPageData).not.toBe(initPageData)
          expect(newNestedCacheData).not.toBe(initNestedCacheData)
          expect(newRouteHandlerData).not.toEqual(initRouteHandlerData)
          expect(newEdgeRouteHandlerData).not.toEqual(initEdgeRouteHandlerRes)
          return 'success'
        }, 'success')
      }
    )
  }

  // On-Demand Revalidate has not effect in dev since app routes
  // aren't considered static until prerendering
  if (!(global as any).isNextDev && !process.env.CUSTOM_CACHE_HANDLER) {
    it('should not revalidate / when revalidate is not used', async () => {
      let prevData

      for (let i = 0; i < 5; i++) {
        const res = await next.fetch('/')
        const html = await res.text()
        const $ = cheerio.load(html)
        const data = $('#page-data').text()

        expect(res.status).toBe(200)

        if (prevData) {
          expect(prevData).toBe(data)
          prevData = data
        }
        await waitFor(500)
      }

      if (isNextStart) {
        expect(next.cliOutput.substring(buildCliOutputIndex)).not.toContain(
          'rendering index'
        )
      }
    })

    it.each([
      {
        type: 'edge route handler',
        revalidateApi: '/api/revalidate-path-edge',
      },
      {
        type: 'node route handler',
        revalidateApi: '/api/revalidate-path-node',
      },
    ])(
      'it should revalidate correctly with $type',
      async ({ revalidateApi }) => {
        const initRes = await next.fetch(
          '/variable-revalidate/revalidate-360-isr'
        )
        const html = await initRes.text()
        const $ = cheerio.load(html)
        const initLayoutData = $('#layout-data').text()
        const initPageData = $('#page-data').text()

        expect(initLayoutData).toBeTruthy()
        expect(initPageData).toBeTruthy()

        await check(async () => {
          const revalidateRes = await next.fetch(
            `${revalidateApi}?path=/variable-revalidate/revalidate-360-isr`
          )
          expect((await revalidateRes.json()).revalidated).toBe(true)

          const newRes = await next.fetch(
            '/variable-revalidate/revalidate-360-isr'
          )
          const newHtml = await newRes.text()
          const new$ = cheerio.load(newHtml)
          const newLayoutData = new$('#layout-data').text()
          const newPageData = new$('#page-data').text()

          expect(newLayoutData).toBeTruthy()
          expect(newPageData).toBeTruthy()
          expect(newLayoutData).not.toBe(initLayoutData)
          expect(newPageData).not.toBe(initPageData)
          return 'success'
        }, 'success')
      }
    )
  }

  // On-Demand Revalidate has not effect in dev
  if (!(global as any).isNextDev && !process.env.CUSTOM_CACHE_HANDLER) {
    it('should revalidate all fetches during on-demand revalidate', async () => {
      const initRes = await next.fetch(
        '/variable-revalidate/revalidate-360-isr'
      )
      const html = await initRes.text()
      const $ = cheerio.load(html)
      const initLayoutData = $('#layout-data').text()
      const initPageData = $('#page-data').text()

      expect(initLayoutData).toBeTruthy()
      expect(initPageData).toBeTruthy()

      await check(async () => {
        const revalidateRes = await next.fetch(
          '/api/revalidate-path-node?path=/variable-revalidate/revalidate-360-isr'
        )
        expect((await revalidateRes.json()).revalidated).toBe(true)

        const newRes = await next.fetch(
          '/variable-revalidate/revalidate-360-isr'
        )
        const newHtml = await newRes.text()
        const new$ = cheerio.load(newHtml)
        const newLayoutData = new$('#layout-data').text()
        const newPageData = new$('#page-data').text()

        expect(newLayoutData).toBeTruthy()
        expect(newPageData).toBeTruthy()
        expect(newLayoutData).not.toBe(initLayoutData)
        expect(newPageData).not.toBe(initPageData)
        return 'success'
      }, 'success')
    })
  }

  it('should correctly handle fetchCache = "force-no-store"', async () => {
    const initRes = await next.fetch('/force-no-store')
    const html = await initRes.text()
    const $ = cheerio.load(html)
    const initPageData = $('#page-data').text()
    expect(initPageData).toBeTruthy()

    const newRes = await next.fetch('/force-no-store')
    const newHtml = await newRes.text()
    const new$ = cheerio.load(newHtml)
    const newPageData = new$('#page-data').text()

    expect(newPageData).toBeTruthy()
    expect(newPageData).not.toBe(initPageData)
  })

  if (!process.env.CUSTOM_CACHE_HANDLER) {
    it('should revalidate correctly with config and fetch revalidate', async () => {
      const initial$ = await next.render$(
        '/variable-config-revalidate/revalidate-3'
      )
      const initialDate = initial$('#date').text()
      const initialRandomData = initial$('#random-data').text()

      expect(initialDate).toBeTruthy()
      expect(initialRandomData).toBeTruthy()

      let prevInitialDate
      let prevInitialRandomData

      // wait for a fresh revalidation
      await check(async () => {
        const $ = await next.render$('/variable-config-revalidate/revalidate-3')
        prevInitialDate = $('#date').text()
        prevInitialRandomData = $('#random-data').text()

        expect(prevInitialDate).not.toBe(initialDate)
        expect(prevInitialRandomData).not.toBe(initialRandomData)
        return 'success'
      }, 'success')

      // the date should revalidate first after 3 seconds
      // while the fetch data stays in place for 9 seconds
      await check(async () => {
        const $ = await next.render$('/variable-config-revalidate/revalidate-3')
        const curDate = $('#date').text()
        const curRandomData = $('#random-data').text()

        expect(curDate).not.toBe(prevInitialDate)
        expect(curRandomData).not.toBe(prevInitialRandomData)

        prevInitialDate = curDate
        prevInitialRandomData = curRandomData
        return 'success'
      }, 'success')
    })
  }

  it('should not cache non-ok statusCode', async () => {
    await check(async () => {
      const $ = await next.render$('/variable-revalidate/status-code')
      const origData = JSON.parse($('#page-data').text())

      expect(origData.status).toBe(404)

      const new$ = await next.render$('/variable-revalidate/status-code')
      const newData = JSON.parse(new$('#page-data').text())
      expect(newData.status).toBe(origData.status)
      expect(newData.text).not.toBe(origData.text)
      return 'success'
    }, 'success')
  })

  if (isNextStart) {
    it('should not encode dynamic parameters as search parameters in RSC data', async () => {
      const data = process.env.__NEXT_CACHE_COMPONENTS
        ? await next.readFile('.next/server/app/blog/seb.prefetch.rsc')
        : await next.readFile('.next/server/app/blog/seb.rsc')

      // During SSG, pages that correspond with dynamic routes shouldn't have any search
      // parameters in the `__PAGE__` segment string. The only time we expect to see
      // search parameters in the `__PAGE__` segment string is when the RSC data is
      // requested from the client with search parameters.
      expect(data).not.toContain('__PAGE__?')
      expect(data).toContain('__PAGE__')
    })

    it('should output HTML/RSC files for static paths', async () => {
      const files = (
        await glob('**/*', {
          cwd: join(next.testDir, '.next/server/app'),
        })
      )
        // Manifests are output per-page in Turbopack
        .filter(
          (file) =>
            !file.endsWith('react-loadable-manifest.js') &&
            // Match html/rsc only as that is what the test is for.
            file.match(/.*\.(html|rsc)$/)
        )
        .map((file) => {
          return file.replace(
            /partial-gen-params-no-additional-([\w]{1,})\/([\w]{1,})\/([\d]{1,})/,
            'partial-gen-params-no-additional-$1/$2/RAND'
          )
        })

      expect(files.sort()).toMatchInlineSnapshot(`
       [
         "_not-found.html",
         "_not-found.rsc",
         "_not-found.segments/_full.segment.rsc",
         "_not-found.segments/_index.segment.rsc",
         "_not-found.segments/_not-found.segment.rsc",
         "_not-found.segments/_not-found/__PAGE__.segment.rsc",
         "_not-found.segments/_tree.segment.rsc",
         "articles/works.html",
         "articles/works.rsc",
         "articles/works.segments/_full.segment.rsc",
         "articles/works.segments/_index.segment.rsc",
         "articles/works.segments/_tree.segment.rsc",
         "articles/works.segments/articles.segment.rsc",
         "articles/works.segments/articles/$d$slug.segment.rsc",
         "articles/works.segments/articles/$d$slug/__PAGE__.segment.rsc",
         "blog/seb.html",
         "blog/seb.rsc",
         "blog/seb.segments/_full.segment.rsc",
         "blog/seb.segments/_index.segment.rsc",
         "blog/seb.segments/_tree.segment.rsc",
         "blog/seb.segments/blog.segment.rsc",
         "blog/seb.segments/blog/$d$author.segment.rsc",
         "blog/seb.segments/blog/$d$author/__PAGE__.segment.rsc",
         "blog/seb/second-post.html",
         "blog/seb/second-post.rsc",
         "blog/seb/second-post.segments/_full.segment.rsc",
         "blog/seb/second-post.segments/_index.segment.rsc",
         "blog/seb/second-post.segments/_tree.segment.rsc",
         "blog/seb/second-post.segments/blog.segment.rsc",
         "blog/seb/second-post.segments/blog/$d$author.segment.rsc",
         "blog/seb/second-post.segments/blog/$d$author/$d$slug.segment.rsc",
         "blog/seb/second-post.segments/blog/$d$author/$d$slug/__PAGE__.segment.rsc",
         "blog/styfle.html",
         "blog/styfle.rsc",
         "blog/styfle.segments/_full.segment.rsc",
         "blog/styfle.segments/_index.segment.rsc",
         "blog/styfle.segments/_tree.segment.rsc",
         "blog/styfle.segments/blog.segment.rsc",
         "blog/styfle.segments/blog/$d$author.segment.rsc",
         "blog/styfle.segments/blog/$d$author/__PAGE__.segment.rsc",
         "blog/styfle/first-post.html",
         "blog/styfle/first-post.rsc",
         "blog/styfle/first-post.segments/_full.segment.rsc",
         "blog/styfle/first-post.segments/_index.segment.rsc",
         "blog/styfle/first-post.segments/_tree.segment.rsc",
         "blog/styfle/first-post.segments/blog.segment.rsc",
         "blog/styfle/first-post.segments/blog/$d$author.segment.rsc",
         "blog/styfle/first-post.segments/blog/$d$author/$d$slug.segment.rsc",
         "blog/styfle/first-post.segments/blog/$d$author/$d$slug/__PAGE__.segment.rsc",
         "blog/styfle/second-post.html",
         "blog/styfle/second-post.rsc",
         "blog/styfle/second-post.segments/_full.segment.rsc",
         "blog/styfle/second-post.segments/_index.segment.rsc",
         "blog/styfle/second-post.segments/_tree.segment.rsc",
         "blog/styfle/second-post.segments/blog.segment.rsc",
         "blog/styfle/second-post.segments/blog/$d$author.segment.rsc",
         "blog/styfle/second-post.segments/blog/$d$author/$d$slug.segment.rsc",
         "blog/styfle/second-post.segments/blog/$d$author/$d$slug/__PAGE__.segment.rsc",
         "blog/tim.html",
         "blog/tim.rsc",
         "blog/tim.segments/_full.segment.rsc",
         "blog/tim.segments/_index.segment.rsc",
         "blog/tim.segments/_tree.segment.rsc",
         "blog/tim.segments/blog.segment.rsc",
         "blog/tim.segments/blog/$d$author.segment.rsc",
         "blog/tim.segments/blog/$d$author/__PAGE__.segment.rsc",
         "blog/tim/first-post.html",
         "blog/tim/first-post.rsc",
         "blog/tim/first-post.segments/_full.segment.rsc",
         "blog/tim/first-post.segments/_index.segment.rsc",
         "blog/tim/first-post.segments/_tree.segment.rsc",
         "blog/tim/first-post.segments/blog.segment.rsc",
         "blog/tim/first-post.segments/blog/$d$author.segment.rsc",
         "blog/tim/first-post.segments/blog/$d$author/$d$slug.segment.rsc",
         "blog/tim/first-post.segments/blog/$d$author/$d$slug/__PAGE__.segment.rsc",
         "default-config-fetch.html",
         "default-config-fetch.rsc",
         "default-config-fetch.segments/!KG5ldyk.segment.rsc",
         "default-config-fetch.segments/!KG5ldyk/default-config-fetch.segment.rsc",
         "default-config-fetch.segments/!KG5ldyk/default-config-fetch/__PAGE__.segment.rsc",
         "default-config-fetch.segments/_full.segment.rsc",
         "default-config-fetch.segments/_index.segment.rsc",
         "default-config-fetch.segments/_tree.segment.rsc",
         "force-cache.html",
         "force-cache.rsc",
         "force-cache.segments/_full.segment.rsc",
         "force-cache.segments/_index.segment.rsc",
         "force-cache.segments/_tree.segment.rsc",
         "force-cache.segments/force-cache.segment.rsc",
         "force-cache.segments/force-cache/__PAGE__.segment.rsc",
         "force-static-fetch-no-store.html",
         "force-static-fetch-no-store.rsc",
         "force-static-fetch-no-store.segments/_full.segment.rsc",
         "force-static-fetch-no-store.segments/_index.segment.rsc",
         "force-static-fetch-no-store.segments/_tree.segment.rsc",
         "force-static-fetch-no-store.segments/force-static-fetch-no-store.segment.rsc",
         "force-static-fetch-no-store.segments/force-static-fetch-no-store/__PAGE__.segment.rsc",
         "force-static/first.html",
         "force-static/first.rsc",
         "force-static/first.segments/_full.segment.rsc",
         "force-static/first.segments/_index.segment.rsc",
         "force-static/first.segments/_tree.segment.rsc",
         "force-static/first.segments/force-static.segment.rsc",
         "force-static/first.segments/force-static/$d$slug.segment.rsc",
         "force-static/first.segments/force-static/$d$slug/__PAGE__.segment.rsc",
         "force-static/second.html",
         "force-static/second.rsc",
         "force-static/second.segments/_full.segment.rsc",
         "force-static/second.segments/_index.segment.rsc",
         "force-static/second.segments/_tree.segment.rsc",
         "force-static/second.segments/force-static.segment.rsc",
         "force-static/second.segments/force-static/$d$slug.segment.rsc",
         "force-static/second.segments/force-static/$d$slug/__PAGE__.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.html",
         "gen-params-catch-all-unique/foo/bar.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/_full.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/_index.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/_tree.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/gen-params-catch-all-unique.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/gen-params-catch-all-unique/$c$slug.segment.rsc",
         "gen-params-catch-all-unique/foo/bar.segments/gen-params-catch-all-unique/$c$slug/__PAGE__.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.html",
         "gen-params-catch-all-unique/foo/foo.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/_full.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/_index.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/_tree.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/gen-params-catch-all-unique.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/gen-params-catch-all-unique/$c$slug.segment.rsc",
         "gen-params-catch-all-unique/foo/foo.segments/gen-params-catch-all-unique/$c$slug/__PAGE__.segment.rsc",
         "gen-params-dynamic-revalidate/one.html",
         "gen-params-dynamic-revalidate/one.rsc",
         "gen-params-dynamic-revalidate/one.segments/_full.segment.rsc",
         "gen-params-dynamic-revalidate/one.segments/_index.segment.rsc",
         "gen-params-dynamic-revalidate/one.segments/_tree.segment.rsc",
         "gen-params-dynamic-revalidate/one.segments/gen-params-dynamic-revalidate.segment.rsc",
         "gen-params-dynamic-revalidate/one.segments/gen-params-dynamic-revalidate/$d$slug.segment.rsc",
         "gen-params-dynamic-revalidate/one.segments/gen-params-dynamic-revalidate/$d$slug/__PAGE__.segment.rsc",
         "hooks/use-pathname/slug.html",
         "hooks/use-pathname/slug.rsc",
         "hooks/use-pathname/slug.segments/_full.segment.rsc",
         "hooks/use-pathname/slug.segments/_index.segment.rsc",
         "hooks/use-pathname/slug.segments/_tree.segment.rsc",
         "hooks/use-pathname/slug.segments/hooks.segment.rsc",
         "hooks/use-pathname/slug.segments/hooks/use-pathname.segment.rsc",
         "hooks/use-pathname/slug.segments/hooks/use-pathname/$d$slug.segment.rsc",
         "hooks/use-pathname/slug.segments/hooks/use-pathname/$d$slug/__PAGE__.segment.rsc",
         "hooks/use-search-params/force-static.html",
         "hooks/use-search-params/force-static.rsc",
         "hooks/use-search-params/force-static.segments/_full.segment.rsc",
         "hooks/use-search-params/force-static.segments/_index.segment.rsc",
         "hooks/use-search-params/force-static.segments/_tree.segment.rsc",
         "hooks/use-search-params/force-static.segments/hooks.segment.rsc",
         "hooks/use-search-params/force-static.segments/hooks/use-search-params.segment.rsc",
         "hooks/use-search-params/force-static.segments/hooks/use-search-params/force-static.segment.rsc",
         "hooks/use-search-params/force-static.segments/hooks/use-search-params/force-static/__PAGE__.segment.rsc",
         "hooks/use-search-params/with-suspense.html",
         "hooks/use-search-params/with-suspense.rsc",
         "hooks/use-search-params/with-suspense.segments/_full.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/_index.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/_tree.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/hooks.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/hooks/use-search-params.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/hooks/use-search-params/with-suspense.segment.rsc",
         "hooks/use-search-params/with-suspense.segments/hooks/use-search-params/with-suspense/__PAGE__.segment.rsc",
         "index.html",
         "index.rsc",
         "index.segments/__PAGE__.segment.rsc",
         "index.segments/_full.segment.rsc",
         "index.segments/_index.segment.rsc",
         "index.segments/_tree.segment.rsc",
         "isr-error-handling.html",
         "isr-error-handling.rsc",
         "isr-error-handling.segments/_full.segment.rsc",
         "isr-error-handling.segments/_index.segment.rsc",
         "isr-error-handling.segments/_tree.segment.rsc",
         "isr-error-handling.segments/isr-error-handling.segment.rsc",
         "isr-error-handling.segments/isr-error-handling/__PAGE__.segment.rsc",
         "no-config-fetch.html",
         "no-config-fetch.rsc",
         "no-config-fetch.segments/!KG5ldyk.segment.rsc",
         "no-config-fetch.segments/!KG5ldyk/no-config-fetch.segment.rsc",
         "no-config-fetch.segments/!KG5ldyk/no-config-fetch/__PAGE__.segment.rsc",
         "no-config-fetch.segments/_full.segment.rsc",
         "no-config-fetch.segments/_index.segment.rsc",
         "no-config-fetch.segments/_tree.segment.rsc",
         "no-store/static.html",
         "no-store/static.rsc",
         "no-store/static.segments/_full.segment.rsc",
         "no-store/static.segments/_index.segment.rsc",
         "no-store/static.segments/_tree.segment.rsc",
         "no-store/static.segments/no-store.segment.rsc",
         "no-store/static.segments/no-store/static.segment.rsc",
         "no-store/static.segments/no-store/static/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.html",
         "partial-gen-params-no-additional-lang/en/RAND.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/en/RAND.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.html",
         "partial-gen-params-no-additional-lang/en/first.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/en/first.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.html",
         "partial-gen-params-no-additional-lang/en/second.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/en/second.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.html",
         "partial-gen-params-no-additional-lang/fr/RAND.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/RAND.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.html",
         "partial-gen-params-no-additional-lang/fr/first.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/first.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.html",
         "partial-gen-params-no-additional-lang/fr/second.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/partial-gen-params-no-additional-lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/partial-gen-params-no-additional-lang/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-lang/fr/second.segments/partial-gen-params-no-additional-lang/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.html",
         "partial-gen-params-no-additional-slug/en/RAND.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/RAND.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.html",
         "partial-gen-params-no-additional-slug/en/first.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/first.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.html",
         "partial-gen-params-no-additional-slug/en/second.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/en/second.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.html",
         "partial-gen-params-no-additional-slug/fr/RAND.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/RAND.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.html",
         "partial-gen-params-no-additional-slug/fr/first.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/first.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.html",
         "partial-gen-params-no-additional-slug/fr/second.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/_full.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/_index.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/_tree.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/partial-gen-params-no-additional-slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/partial-gen-params-no-additional-slug/$d$lang.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug.segment.rsc",
         "partial-gen-params-no-additional-slug/fr/second.segments/partial-gen-params-no-additional-slug/$d$lang/$d$slug/__PAGE__.segment.rsc",
         "partial-params-false/en/static.html",
         "partial-params-false/en/static.rsc",
         "partial-params-false/en/static.segments/_full.segment.rsc",
         "partial-params-false/en/static.segments/_index.segment.rsc",
         "partial-params-false/en/static.segments/_tree.segment.rsc",
         "partial-params-false/en/static.segments/partial-params-false.segment.rsc",
         "partial-params-false/en/static.segments/partial-params-false/$d$locale.segment.rsc",
         "partial-params-false/en/static.segments/partial-params-false/$d$locale/static.segment.rsc",
         "partial-params-false/en/static.segments/partial-params-false/$d$locale/static/__PAGE__.segment.rsc",
         "partial-params-false/fr/static.html",
         "partial-params-false/fr/static.rsc",
         "partial-params-false/fr/static.segments/_full.segment.rsc",
         "partial-params-false/fr/static.segments/_index.segment.rsc",
         "partial-params-false/fr/static.segments/_tree.segment.rsc",
         "partial-params-false/fr/static.segments/partial-params-false.segment.rsc",
         "partial-params-false/fr/static.segments/partial-params-false/$d$locale.segment.rsc",
         "partial-params-false/fr/static.segments/partial-params-false/$d$locale/static.segment.rsc",
         "partial-params-false/fr/static.segments/partial-params-false/$d$locale/static/__PAGE__.segment.rsc",
         "prerendered-not-found/first.html",
         "prerendered-not-found/first.rsc",
         "prerendered-not-found/first.segments/_full.segment.rsc",
         "prerendered-not-found/first.segments/_index.segment.rsc",
         "prerendered-not-found/first.segments/_tree.segment.rsc",
         "prerendered-not-found/first.segments/prerendered-not-found.segment.rsc",
         "prerendered-not-found/first.segments/prerendered-not-found/$d$slug.segment.rsc",
         "prerendered-not-found/first.segments/prerendered-not-found/$d$slug/__PAGE__.segment.rsc",
         "prerendered-not-found/second.html",
         "prerendered-not-found/second.rsc",
         "prerendered-not-found/second.segments/_full.segment.rsc",
         "prerendered-not-found/second.segments/_index.segment.rsc",
         "prerendered-not-found/second.segments/_tree.segment.rsc",
         "prerendered-not-found/second.segments/prerendered-not-found.segment.rsc",
         "prerendered-not-found/second.segments/prerendered-not-found/$d$slug.segment.rsc",
         "prerendered-not-found/second.segments/prerendered-not-found/$d$slug/__PAGE__.segment.rsc",
         "prerendered-not-found/segment-revalidate.html",
         "prerendered-not-found/segment-revalidate.rsc",
         "prerendered-not-found/segment-revalidate.segments/_full.segment.rsc",
         "prerendered-not-found/segment-revalidate.segments/_index.segment.rsc",
         "prerendered-not-found/segment-revalidate.segments/_tree.segment.rsc",
         "prerendered-not-found/segment-revalidate.segments/prerendered-not-found.segment.rsc",
         "prerendered-not-found/segment-revalidate.segments/prerendered-not-found/segment-revalidate.segment.rsc",
         "prerendered-not-found/segment-revalidate.segments/prerendered-not-found/segment-revalidate/__PAGE__.segment.rsc",
         "ssg-draft-mode.html",
         "ssg-draft-mode.rsc",
         "ssg-draft-mode.segments/_full.segment.rsc",
         "ssg-draft-mode.segments/_index.segment.rsc",
         "ssg-draft-mode.segments/_tree.segment.rsc",
         "ssg-draft-mode.segments/ssg-draft-mode.segment.rsc",
         "ssg-draft-mode.segments/ssg-draft-mode/$oc$route.segment.rsc",
         "ssg-draft-mode.segments/ssg-draft-mode/$oc$route/__PAGE__.segment.rsc",
         "ssg-draft-mode/test-2.html",
         "ssg-draft-mode/test-2.rsc",
         "ssg-draft-mode/test-2.segments/_full.segment.rsc",
         "ssg-draft-mode/test-2.segments/_index.segment.rsc",
         "ssg-draft-mode/test-2.segments/_tree.segment.rsc",
         "ssg-draft-mode/test-2.segments/ssg-draft-mode.segment.rsc",
         "ssg-draft-mode/test-2.segments/ssg-draft-mode/$oc$route.segment.rsc",
         "ssg-draft-mode/test-2.segments/ssg-draft-mode/$oc$route/__PAGE__.segment.rsc",
         "ssg-draft-mode/test.html",
         "ssg-draft-mode/test.rsc",
         "ssg-draft-mode/test.segments/_full.segment.rsc",
         "ssg-draft-mode/test.segments/_index.segment.rsc",
         "ssg-draft-mode/test.segments/_tree.segment.rsc",
         "ssg-draft-mode/test.segments/ssg-draft-mode.segment.rsc",
         "ssg-draft-mode/test.segments/ssg-draft-mode/$oc$route.segment.rsc",
         "ssg-draft-mode/test.segments/ssg-draft-mode/$oc$route/__PAGE__.segment.rsc",
         "strip-w3c-trace-context-headers.html",
         "strip-w3c-trace-context-headers.rsc",
         "strip-w3c-trace-context-headers.segments/_full.segment.rsc",
         "strip-w3c-trace-context-headers.segments/_index.segment.rsc",
         "strip-w3c-trace-context-headers.segments/_tree.segment.rsc",
         "strip-w3c-trace-context-headers.segments/strip-w3c-trace-context-headers.segment.rsc",
         "strip-w3c-trace-context-headers.segments/strip-w3c-trace-context-headers/__PAGE__.segment.rsc",
         "unstable-cache/fetch/no-cache.html",
         "unstable-cache/fetch/no-cache.rsc",
         "unstable-cache/fetch/no-cache.segments/_full.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/_index.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/_tree.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/unstable-cache.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/unstable-cache/fetch.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/unstable-cache/fetch/no-cache.segment.rsc",
         "unstable-cache/fetch/no-cache.segments/unstable-cache/fetch/no-cache/__PAGE__.segment.rsc",
         "unstable-cache/fetch/no-store.html",
         "unstable-cache/fetch/no-store.rsc",
         "unstable-cache/fetch/no-store.segments/_full.segment.rsc",
         "unstable-cache/fetch/no-store.segments/_index.segment.rsc",
         "unstable-cache/fetch/no-store.segments/_tree.segment.rsc",
         "unstable-cache/fetch/no-store.segments/unstable-cache.segment.rsc",
         "unstable-cache/fetch/no-store.segments/unstable-cache/fetch.segment.rsc",
         "unstable-cache/fetch/no-store.segments/unstable-cache/fetch/no-store.segment.rsc",
         "unstable-cache/fetch/no-store.segments/unstable-cache/fetch/no-store/__PAGE__.segment.rsc",
         "update-tag-test.html",
         "update-tag-test.rsc",
         "update-tag-test.segments/_full.segment.rsc",
         "update-tag-test.segments/_index.segment.rsc",
         "update-tag-test.segments/_tree.segment.rsc",
         "update-tag-test.segments/update-tag-test.segment.rsc",
         "update-tag-test.segments/update-tag-test/__PAGE__.segment.rsc",
         "variable-config-revalidate/revalidate-3.html",
         "variable-config-revalidate/revalidate-3.rsc",
         "variable-config-revalidate/revalidate-3.segments/_full.segment.rsc",
         "variable-config-revalidate/revalidate-3.segments/_index.segment.rsc",
         "variable-config-revalidate/revalidate-3.segments/_tree.segment.rsc",
         "variable-config-revalidate/revalidate-3.segments/variable-config-revalidate.segment.rsc",
         "variable-config-revalidate/revalidate-3.segments/variable-config-revalidate/revalidate-3.segment.rsc",
         "variable-config-revalidate/revalidate-3.segments/variable-config-revalidate/revalidate-3/__PAGE__.segment.rsc",
         "variable-revalidate-stable/revalidate-3.html",
         "variable-revalidate-stable/revalidate-3.rsc",
         "variable-revalidate-stable/revalidate-3.segments/_full.segment.rsc",
         "variable-revalidate-stable/revalidate-3.segments/_index.segment.rsc",
         "variable-revalidate-stable/revalidate-3.segments/_tree.segment.rsc",
         "variable-revalidate-stable/revalidate-3.segments/variable-revalidate-stable.segment.rsc",
         "variable-revalidate-stable/revalidate-3.segments/variable-revalidate-stable/revalidate-3.segment.rsc",
         "variable-revalidate-stable/revalidate-3.segments/variable-revalidate-stable/revalidate-3/__PAGE__.segment.rsc",
         "variable-revalidate/authorization.html",
         "variable-revalidate/authorization.rsc",
         "variable-revalidate/authorization.segments/_full.segment.rsc",
         "variable-revalidate/authorization.segments/_index.segment.rsc",
         "variable-revalidate/authorization.segments/_tree.segment.rsc",
         "variable-revalidate/authorization.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/authorization.segments/variable-revalidate/authorization.segment.rsc",
         "variable-revalidate/authorization.segments/variable-revalidate/authorization/__PAGE__.segment.rsc",
         "variable-revalidate/cookie.html",
         "variable-revalidate/cookie.rsc",
         "variable-revalidate/cookie.segments/_full.segment.rsc",
         "variable-revalidate/cookie.segments/_index.segment.rsc",
         "variable-revalidate/cookie.segments/_tree.segment.rsc",
         "variable-revalidate/cookie.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/cookie.segments/variable-revalidate/cookie.segment.rsc",
         "variable-revalidate/cookie.segments/variable-revalidate/cookie/__PAGE__.segment.rsc",
         "variable-revalidate/encoding.html",
         "variable-revalidate/encoding.rsc",
         "variable-revalidate/encoding.segments/_full.segment.rsc",
         "variable-revalidate/encoding.segments/_index.segment.rsc",
         "variable-revalidate/encoding.segments/_tree.segment.rsc",
         "variable-revalidate/encoding.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/encoding.segments/variable-revalidate/encoding.segment.rsc",
         "variable-revalidate/encoding.segments/variable-revalidate/encoding/__PAGE__.segment.rsc",
         "variable-revalidate/headers-instance.html",
         "variable-revalidate/headers-instance.rsc",
         "variable-revalidate/headers-instance.segments/_full.segment.rsc",
         "variable-revalidate/headers-instance.segments/_index.segment.rsc",
         "variable-revalidate/headers-instance.segments/_tree.segment.rsc",
         "variable-revalidate/headers-instance.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/headers-instance.segments/variable-revalidate/headers-instance.segment.rsc",
         "variable-revalidate/headers-instance.segments/variable-revalidate/headers-instance/__PAGE__.segment.rsc",
         "variable-revalidate/revalidate-3.html",
         "variable-revalidate/revalidate-3.rsc",
         "variable-revalidate/revalidate-3.segments/_full.segment.rsc",
         "variable-revalidate/revalidate-3.segments/_index.segment.rsc",
         "variable-revalidate/revalidate-3.segments/_tree.segment.rsc",
         "variable-revalidate/revalidate-3.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/revalidate-3.segments/variable-revalidate/revalidate-3.segment.rsc",
         "variable-revalidate/revalidate-3.segments/variable-revalidate/revalidate-3/__PAGE__.segment.rsc",
         "variable-revalidate/revalidate-360-isr.html",
         "variable-revalidate/revalidate-360-isr.rsc",
         "variable-revalidate/revalidate-360-isr.segments/_full.segment.rsc",
         "variable-revalidate/revalidate-360-isr.segments/_index.segment.rsc",
         "variable-revalidate/revalidate-360-isr.segments/_tree.segment.rsc",
         "variable-revalidate/revalidate-360-isr.segments/variable-revalidate.segment.rsc",
         "variable-revalidate/revalidate-360-isr.segments/variable-revalidate/revalidate-360-isr.segment.rsc",
         "variable-revalidate/revalidate-360-isr.segments/variable-revalidate/revalidate-360-isr/__PAGE__.segment.rsc",
       ]
      `)
    })

    it('should have correct prerender-manifest entries', async () => {
      const curManifest = JSON.parse(JSON.stringify(prerenderManifest))

      for (const key of Object.keys(curManifest.dynamicRoutes)) {
        const item = curManifest.dynamicRoutes[key]

        if (item.dataRouteRegex) {
          item.dataRouteRegex = normalizeRegEx(item.dataRouteRegex)
        }
        if (item.routeRegex) {
          item.routeRegex = normalizeRegEx(item.routeRegex)
        }
      }

      for (const key of Object.keys(curManifest.routes)) {
        const newKey = key.replace(
          /partial-gen-params-no-additional-([\w]{1,})\/([\w]{1,})\/([\d]{1,})/,
          'partial-gen-params-no-additional-$1/$2/RAND'
        )
        if (newKey !== key) {
          const route = curManifest.routes[key]
          delete curManifest.routes[key]
          curManifest.routes[newKey] = {
            ...route,
            dataRoute: `${newKey}.rsc`,
          }
        }
      }

      expect(curManifest.version).toBe(4)
      expect(curManifest.routes).toMatchInlineSnapshot(`
       {
         "/": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/index.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/",
         },
         "/_not-found": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/_not-found.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "initialStatus": 404,
           "prefetchDataRoute": null,
           "srcRoute": "/_not-found",
         },
         "/api/large-data": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": null,
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialHeaders": {
             "content-type": "application/json",
             "x-next-cache-tags": "_N_T_/layout,_N_T_/api/layout,_N_T_/api/large-data/layout,_N_T_/api/large-data/route,_N_T_/api/large-data",
           },
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/api/large-data",
         },
         "/articles/works": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/articles/works.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 1,
           "prefetchDataRoute": null,
           "srcRoute": "/articles/[slug]",
         },
         "/blog/seb": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/seb.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]",
         },
         "/blog/seb/second-post": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/seb/second-post.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]/[slug]",
         },
         "/blog/styfle": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/styfle.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]",
         },
         "/blog/styfle/first-post": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/styfle/first-post.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]/[slug]",
         },
         "/blog/styfle/second-post": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/styfle/second-post.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]/[slug]",
         },
         "/blog/tim": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/tim.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]",
         },
         "/blog/tim/first-post": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/tim/first-post.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/blog/[author]/[slug]",
         },
         "/default-config-fetch": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/default-config-fetch.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/default-config-fetch",
         },
         "/force-cache": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/force-cache.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/force-cache",
         },
         "/force-static-fetch-no-store": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/force-static-fetch-no-store.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/force-static-fetch-no-store",
         },
         "/force-static/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/force-static/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/force-static/[slug]",
         },
         "/force-static/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/force-static/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/force-static/[slug]",
         },
         "/gen-params-catch-all-unique/foo/bar": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/gen-params-catch-all-unique/foo/bar.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/gen-params-catch-all-unique/[...slug]",
         },
         "/gen-params-catch-all-unique/foo/foo": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/gen-params-catch-all-unique/foo/foo.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/gen-params-catch-all-unique/[...slug]",
         },
         "/gen-params-dynamic-revalidate/one": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/gen-params-dynamic-revalidate/one.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/gen-params-dynamic-revalidate/[slug]",
         },
         "/hooks/use-pathname/slug": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/hooks/use-pathname/slug.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/hooks/use-pathname/[slug]",
         },
         "/hooks/use-search-params/force-static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/hooks/use-search-params/force-static.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/hooks/use-search-params/force-static",
         },
         "/hooks/use-search-params/with-suspense": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/hooks/use-search-params/with-suspense.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/hooks/use-search-params/with-suspense",
         },
         "/isr-error-handling": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/isr-error-handling.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/isr-error-handling",
         },
         "/no-config-fetch": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/no-config-fetch.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/no-config-fetch",
         },
         "/no-store/static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/no-store/static.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/no-store/static",
         },
         "/partial-gen-params-no-additional-lang/en/RAND": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/en/RAND.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-lang/en/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/en/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-lang/en/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/en/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-lang/fr/RAND": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/fr/RAND.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-lang/fr/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/fr/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-lang/fr/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/fr/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/en/RAND": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/en/RAND.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/en/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/en/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/en/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/en/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/fr/RAND": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/fr/RAND.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/fr/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/fr/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-gen-params-no-additional-slug/fr/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/fr/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug]",
         },
         "/partial-params-false/en/static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-params-false/en/static.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-params-false/[locale]/static",
         },
         "/partial-params-false/fr/static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-params-false/fr/static.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/partial-params-false/[locale]/static",
         },
         "/prerendered-not-found/first": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/prerendered-not-found/first.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/prerendered-not-found/[slug]",
         },
         "/prerendered-not-found/second": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/prerendered-not-found/second.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/prerendered-not-found/[slug]",
         },
         "/prerendered-not-found/segment-revalidate": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/prerendered-not-found/segment-revalidate.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/prerendered-not-found/segment-revalidate",
         },
         "/route-handler/no-store-force-static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": null,
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialHeaders": {
             "content-type": "application/json",
             "x-next-cache-tags": "_N_T_/layout,_N_T_/route-handler/layout,_N_T_/route-handler/no-store-force-static/layout,_N_T_/route-handler/no-store-force-static/route,_N_T_/route-handler/no-store-force-static",
           },
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/route-handler/no-store-force-static",
         },
         "/route-handler/revalidate-360-isr": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": null,
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialHeaders": {
             "content-type": "application/json",
             "x-next-cache-tags": "_N_T_/layout,_N_T_/route-handler/layout,_N_T_/route-handler/revalidate-360-isr/layout,_N_T_/route-handler/revalidate-360-isr/route,_N_T_/route-handler/revalidate-360-isr,thankyounext",
           },
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/route-handler/revalidate-360-isr",
         },
         "/route-handler/static-cookies": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": null,
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialHeaders": {
             "set-cookie": "theme=light; Path=/,my_company=ACME; Path=/",
             "x-next-cache-tags": "_N_T_/layout,_N_T_/route-handler/layout,_N_T_/route-handler/static-cookies/layout,_N_T_/route-handler/static-cookies/route,_N_T_/route-handler/static-cookies",
           },
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/route-handler/static-cookies",
         },
         "/ssg-draft-mode": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/ssg-draft-mode.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/ssg-draft-mode/[[...route]]",
         },
         "/ssg-draft-mode/test": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/ssg-draft-mode/test.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/ssg-draft-mode/[[...route]]",
         },
         "/ssg-draft-mode/test-2": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/ssg-draft-mode/test-2.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/ssg-draft-mode/[[...route]]",
         },
         "/strip-w3c-trace-context-headers": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/strip-w3c-trace-context-headers.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 50,
           "prefetchDataRoute": null,
           "srcRoute": "/strip-w3c-trace-context-headers",
         },
         "/unstable-cache/fetch/no-cache": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/unstable-cache/fetch/no-cache.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/unstable-cache/fetch/no-cache",
         },
         "/unstable-cache/fetch/no-store": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/unstable-cache/fetch/no-store.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/unstable-cache/fetch/no-store",
         },
         "/update-tag-test": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/update-tag-test.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialRevalidateSeconds": false,
           "prefetchDataRoute": null,
           "srcRoute": "/update-tag-test",
         },
         "/variable-config-revalidate/revalidate-3": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-config-revalidate/revalidate-3.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-config-revalidate/revalidate-3",
         },
         "/variable-revalidate-stable/revalidate-3": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate-stable/revalidate-3.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate-stable/revalidate-3",
         },
         "/variable-revalidate/authorization": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/authorization.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/authorization",
         },
         "/variable-revalidate/cookie": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/cookie.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/cookie",
         },
         "/variable-revalidate/encoding": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/encoding.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/encoding",
         },
         "/variable-revalidate/headers-instance": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/headers-instance.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/headers-instance",
         },
         "/variable-revalidate/revalidate-3": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/revalidate-3.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 3,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/revalidate-3",
         },
         "/variable-revalidate/revalidate-360-isr": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/variable-revalidate/revalidate-360-isr.rsc",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "initialExpireSeconds": 31536000,
           "initialRevalidateSeconds": 10,
           "prefetchDataRoute": null,
           "srcRoute": "/variable-revalidate/revalidate-360-isr",
         },
       }
      `)
      expect(curManifest.dynamicRoutes).toMatchInlineSnapshot(`
       {
         "/articles/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/articles/[slug].rsc",
           "dataRouteRegex": "^\\/articles\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/articles\\/([^\\/]+?)(?:\\/)?$",
         },
         "/blog/[author]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/[author].rsc",
           "dataRouteRegex": "^\\/blog\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": false,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/blog\\/([^\\/]+?)(?:\\/)?$",
         },
         "/blog/[author]/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/blog/[author]/[slug].rsc",
           "dataRouteRegex": "^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$",
         },
         "/dynamic-error/[id]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/dynamic-error/[id].rsc",
           "dataRouteRegex": "^\\/dynamic\\-error\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/dynamic\\-error\\/([^\\/]+?)(?:\\/)?$",
         },
         "/force-static/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/force-static/[slug].rsc",
           "dataRouteRegex": "^\\/force\\-static\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/force\\-static\\/([^\\/]+?)(?:\\/)?$",
         },
         "/gen-params-catch-all-unique/[...slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/gen-params-catch-all-unique/[...slug].rsc",
           "dataRouteRegex": "^\\/gen\\-params\\-catch\\-all\\-unique\\/(.+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": false,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/gen\\-params\\-catch\\-all\\-unique\\/(.+?)(?:\\/)?$",
         },
         "/gen-params-dynamic-revalidate/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/gen-params-dynamic-revalidate/[slug].rsc",
           "dataRouteRegex": "^\\/gen\\-params\\-dynamic\\-revalidate\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/gen\\-params\\-dynamic\\-revalidate\\/([^\\/]+?)(?:\\/)?$",
         },
         "/hooks/use-pathname/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/hooks/use-pathname/[slug].rsc",
           "dataRouteRegex": "^\\/hooks\\/use\\-pathname\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/hooks\\/use\\-pathname\\/([^\\/]+?)(?:\\/)?$",
         },
         "/partial-gen-params-no-additional-lang/[lang]/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-lang/[lang]/[slug].rsc",
           "dataRouteRegex": "^\\/partial\\-gen\\-params\\-no\\-additional\\-lang\\/([^\\/]+?)\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": false,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/partial\\-gen\\-params\\-no\\-additional\\-lang\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$",
         },
         "/partial-gen-params-no-additional-slug/[lang]/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-gen-params-no-additional-slug/[lang]/[slug].rsc",
           "dataRouteRegex": "^\\/partial\\-gen\\-params\\-no\\-additional\\-slug\\/([^\\/]+?)\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": false,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/partial\\-gen\\-params\\-no\\-additional\\-slug\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$",
         },
         "/partial-params-false/[locale]/static": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/partial-params-false/[locale]/static.rsc",
           "dataRouteRegex": "^\\/partial\\-params\\-false\\/([^\\/]+?)\\/static\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": false,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/partial\\-params\\-false\\/([^\\/]+?)\\/static(?:\\/)?$",
         },
         "/prerendered-not-found/[slug]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/prerendered-not-found/[slug].rsc",
           "dataRouteRegex": "^\\/prerendered\\-not\\-found\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/prerendered\\-not\\-found\\/([^\\/]+?)(?:\\/)?$",
         },
         "/ssg-draft-mode/[[...route]]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/ssg-draft-mode/[[...route]].rsc",
           "dataRouteRegex": "^\\/ssg\\-draft\\-mode(?:\\/(.+?))?\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/ssg\\-draft\\-mode(?:\\/(.+?))?(?:\\/)?$",
         },
         "/static-to-dynamic-error-forced/[id]": {
           "allowHeader": [
             "host",
             "x-matched-path",
             "x-prerender-revalidate",
             "x-prerender-revalidate-if-generated",
             "x-next-revalidated-tags",
             "x-next-revalidate-tag-token",
           ],
           "dataRoute": "/static-to-dynamic-error-forced/[id].rsc",
           "dataRouteRegex": "^\\/static\\-to\\-dynamic\\-error\\-forced\\/([^\\/]+?)\\.rsc$",
           "experimentalBypassFor": [
             {
               "key": "next-action",
               "type": "header",
             },
             {
               "key": "content-type",
               "type": "header",
               "value": "multipart/form-data;.*",
             },
           ],
           "fallback": null,
           "fallbackRouteParams": [],
           "prefetchDataRoute": null,
           "routeRegex": "^\\/static\\-to\\-dynamic\\-error\\-forced\\/([^\\/]+?)(?:\\/)?$",
         },
       }
      `)
    })

    it('should output debug info for static bailouts', async () => {
      const cleanedOutput = stripAnsi(next.cliOutput)

      expect(cleanedOutput).toContain(
        'Static generation failed due to dynamic usage on /force-static, reason: headers'
      )
      expect(cleanedOutput).toContain(
        'Static generation failed due to dynamic usage on /ssr-auto/cache-no-store, reason: no-store fetch'
      )
    })

    it('should log fetch metrics to the diagnostics directory', async () => {
      const fetchMetrics = JSON.parse(
        await next.readFile('.next/diagnostics/fetch-metrics.json')
      )

      const indexFetchMetrics = fetchMetrics['/']

      expect(indexFetchMetrics).toHaveLength(1)
      expect(indexFetchMetrics[0]).toMatchObject({
        url: 'https://next-data-api-endpoint.vercel.app/api/random?page',
        status: 200,
        cacheStatus: expect.any(String),
        start: expect.any(Number),
        end: expect.any(Number),
        cacheReason: expect.any(String),
      })

      const otherPageMetrics =
        fetchMetrics['/variable-revalidate/headers-instance']

      expect(otherPageMetrics).toHaveLength(4)
      expect(otherPageMetrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: 'https://next-data-api-endpoint.vercel.app/api/random?layout',
            status: 200,
            cacheStatus: expect.any(String),
            start: expect.any(Number),
            end: expect.any(Number),
            cacheReason: expect.any(String),
          }),
        ])
      )
    })

    it('should have correct cache tags for prerendered path', async () => {
      const firstMeta = await next.readJSON(
        '.next/server/app/prerendered-not-found/first.meta'
      )
      const secondMeta = await next.readJSON(
        '.next/server/app/prerendered-not-found/second.meta'
      )

      expect(firstMeta.status).toBe(404)
      expect(firstMeta.headers['x-next-cache-tags']).toBe(
        '_N_T_/layout,_N_T_/prerendered-not-found/layout,_N_T_/prerendered-not-found/[slug]/layout,_N_T_/prerendered-not-found/[slug]/page,_N_T_/prerendered-not-found/first,explicit-tag'
      )

      expect(secondMeta.status).not.toBe(404)
      expect(secondMeta.headers['x-next-cache-tags']).toBe(
        '_N_T_/layout,_N_T_/prerendered-not-found/layout,_N_T_/prerendered-not-found/[slug]/layout,_N_T_/prerendered-not-found/[slug]/page,_N_T_/prerendered-not-found/second,explicit-tag'
      )
    })

    // build cache not leveraged for custom cache handler so not seeded
    if (!process.env.CUSTOM_CACHE_HANDLER) {
      it('should correctly error and not update cache for ISR', async () => {
        await next.patchFile('app/isr-error-handling/error.txt', 'yes')

        for (let i = 0; i < 3; i++) {
          const res = await next.fetch('/isr-error-handling')
          const html = await res.text()
          const $ = cheerio.load(html)
          const now = $('#now').text()

          expect(res.status).toBe(200)
          expect(now).toBeTruthy()

          // wait revalidate period
          await waitFor(3000)
        }
        expect(next.cliOutput).toContain('intentional error')
      })
    }
  }

  it.each([
    { path: '/stale-cache-serving/app-page' },
    { path: '/stale-cache-serving/route-handler' },
    { path: '/stale-cache-serving-edge/app-page' },
    { path: '/stale-cache-serving-edge/route-handler' },
  ])('should stream properly for $path', async ({ path }) => {
    // Prime the cache.
    let res = await next.fetch(path)
    expect(res.status).toBe(200)

    // Consume the cache, the revalidations are completed on the end of the
    // stream so we need to wait for that to complete.
    await res.text()

    for (let i = 0; i < 6; i++) {
      await waitFor(1000)

      res = await next.fetch(path)

      let data: any
      let startedStreaming: number = -1
      res.body.on('data', () => {
        if (startedStreaming === -1) {
          startedStreaming = Date.now()
        }
      })
      if (res.headers.get('content-type').includes('application/json')) {
        data = await res.json()
      } else {
        const html = await res.text()
        const $ = cheerio.load(html)
        const dataJSON = $('#data').text()
        try {
          data = JSON.parse(dataJSON)
        } catch (cause) {
          throw new Error(
            `Failed to parse JSON from data-start attribute: "${dataJSON}"`,
            { cause }
          )
        }
      }

      const startedResponding = +data.start
      if (Number.isNaN(startedResponding)) {
        throw new Error(
          `Expected start to be a number. Received: "${data.start}"`
        )
      }
      if (startedStreaming === -1) {
        throw new Error(
          'Expected startedStreaming to be set. This is a bug in the test.'
        )
      }

      // We just want to ensure the response isn't blocked on revalidating the fetch.
      // So we use the start time when route started processing not when we
      // send off the response because that includes cold boots of the infra.
      if (startedStreaming - startedResponding >= 3000) {
        throw new Error(
          `Response #${i} took too long to complete: ${startedStreaming - startedResponding}ms`
        )
      }
    }
  })

  it('should correctly handle statusCode with notFound + ISR', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await next.fetch('/articles/non-existent')

      if (process.env.__NEXT_CACHE_COMPONENTS && !isNextDev) {
        expect(res.status).toBe(200)
      } else {
        expect(res.status).toBe(404)
      }
      expect(await res.text()).toContain('This page could not be found')
      await waitFor(500)
    }
  })

  it('should cache correctly for fetchCache = default-cache', async () => {
    const res = await next.fetch('/default-cache')
    expect(res.status).toBe(200)

    let prevHtml = await res.text()
    let prev$ = cheerio.load(prevHtml)

    await check(async () => {
      const curRes = await next.fetch('/default-cache')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      try {
        expect(cur$('#data-no-cache').text()).not.toBe(
          prev$('#data-no-cache').text()
        )
        expect(cur$('#data-force-cache').text()).toBe(
          prev$('#data-force-cache').text()
        )
        expect(cur$('#data-revalidate-cache').text()).toBe(
          prev$('#data-revalidate-cache').text()
        )
        expect(cur$('#data-revalidate-and-fetch-cache').text()).toBe(
          prev$('#data-revalidate-and-fetch-cache').text()
        )
        expect(cur$('#data-revalidate-and-fetch-cache').text()).toBe(
          prev$('#data-revalidate-and-fetch-cache').text()
        )

        expect(cur$('#data-auto-cache').text()).not.toBe(
          prev$('data-auto-cache').text()
        )
      } finally {
        prevHtml = curHtml
        prev$ = cur$
      }
      return 'success'
    }, 'success')
  })

  it('should cache correctly when accessing search params opts into dynamic rendering', async () => {
    const res = await next.fetch('/default-cache-search-params')
    expect(res.status).toBe(200)

    let prevHtml = await res.text()
    let prev$ = cheerio.load(prevHtml)

    await retry(async () => {
      const curRes = await next.fetch('/default-cache-search-params')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      expect(cur$('#data-default-cache').text()).not.toBe(
        prev$('#data-default-cache').text()
      )
      expect(cur$('#data-request-cache').text()).not.toBe(
        prev$('#data-request-cache').text()
      )
      expect(cur$('#data-cache-auto').text()).not.toBe(
        prev$('#data-cache-auto').text()
      )
    })
  })

  it('should cache correctly for fetchCache = force-cache', async () => {
    const res = await next.fetch('/force-cache')
    expect(res.status).toBe(200)

    let prevHtml = await res.text()
    let prev$ = cheerio.load(prevHtml)

    await retry(async () => {
      const curRes = await next.fetch('/force-cache')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      expect(cur$('#data-no-cache').text()).toBe(prev$('#data-no-cache').text())
      expect(cur$('#data-force-cache').text()).toBe(
        prev$('#data-force-cache').text()
      )
      expect(cur$('#data-revalidate-cache').text()).toBe(
        prev$('#data-revalidate-cache').text()
      )
      expect(cur$('#data-revalidate-and-fetch-cache').text()).toBe(
        prev$('#data-revalidate-and-fetch-cache').text()
      )
      expect(cur$('#data-auto-cache').text()).toBe(
        prev$('#data-auto-cache').text()
      )
    })
  })

  it('should cache correctly for cache: "force-cache" and "revalidate"', async () => {
    let prevValue: string | undefined
    await retry(async () => {
      const res = await next.fetch('/force-cache-revalidate')
      expect(res.status).toBe(200)

      let prevHtml = await res.text()
      let prev$ = cheerio.load(prevHtml)

      const curRes = await next.fetch('/force-cache-revalidate')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      expect(cur$('#data-force-cache').text()).toBe(
        prev$('#data-force-cache').text()
      )

      prevValue = cur$('#data-force-cache').text()
    })

    // wait for revalidation
    await waitFor(3000)

    await retry(async () => {
      const curRes = await next.fetch('/force-cache-revalidate')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      expect(cur$('#data-force-cache').text()).not.toBe(prevValue)
    })
  })

  it('should cache correctly for cache: no-store', async () => {
    const res = await next.fetch('/fetch-no-cache')
    expect(res.status).toBe(200)

    let prevHtml = await res.text()
    let prev$ = cheerio.load(prevHtml)

    await check(async () => {
      const curRes = await next.fetch('/fetch-no-cache')
      expect(curRes.status).toBe(200)

      const curHtml = await curRes.text()
      const cur$ = cheerio.load(curHtml)

      try {
        expect(cur$('#data-no-cache').text()).not.toBe(
          prev$('#data-no-cache').text()
        )
        expect(cur$('#data-force-cache').text()).toBe(
          prev$('#data-force-cache').text()
        )
        expect(cur$('#data-revalidate-cache').text()).toBe(
          prev$('#data-revalidate-cache').text()
        )
        expect(cur$('#data-revalidate-and-fetch-cache').text()).toBe(
          prev$('#data-revalidate-and-fetch-cache').text()
        )
        expect(cur$('#data-auto-cache').text()).not.toBe(
          prev$('#data-auto-cache').text()
        )
      } finally {
        prevHtml = curHtml
        prev$ = cur$
      }
      return 'success'
    }, 'success')
  })

  if (isNextDev) {
    it('should bypass fetch cache with cache-control: no-cache', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/revalidate-3'
      )

      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/revalidate-3',
        undefined,
        {
          headers: {
            'cache-control': 'no-cache',
          },
        }
      )

      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)
      expect($2('#layout-data').text()).not.toBe(layoutData)
      expect($2('#page-data').text()).not.toBe(pageData)
    })
  } else {
    // TODO: re-implement this in a way that'll support PFPR
    if (!process.env.__NEXT_CACHE_COMPONENTS) {
      it('should not error with dynamic server usage with force-static', async () => {
        const res = await next.fetch(
          '/static-to-dynamic-error-forced/static-bailout-1'
        )
        const outputIndex = next.cliOutput.length
        const html = await res.text()

        expect(res.status).toBe(200)
        expect(html).toContain('/static-to-dynamic-error-forced')
        expect(html).toMatch(/id:.*?static-bailout-1/)

        if (isNextStart) {
          expect(stripAnsi(next.cliOutput).substring(outputIndex)).not.toMatch(
            /Page changed from static to dynamic at runtime \/static-to-dynamic-error-forced\/static-bailout-1, reason: cookies/
          )
        }
      })
    }

    it('should produce response with url from fetch', async () => {
      const res = await next.fetch('/response-url')
      expect(res.status).toBe(200)

      const html = await res.text()
      const $ = cheerio.load(html)

      expect($('#data-url-default-cache').text()).toBe(
        'https://next-data-api-endpoint.vercel.app/api/random?a1'
      )
      expect($('#data-url-no-cache').text()).toBe(
        'https://next-data-api-endpoint.vercel.app/api/random?b2'
      )
      expect($('#data-url-cached').text()).toBe(
        'https://next-data-api-endpoint.vercel.app/api/random?a1'
      )
      expect($('#data-value-default-cache').text()).toBe(
        $('#data-value-cached').text()
      )
    })

    if (!process.env.__NEXT_CACHE_COMPONENTS) {
      it('should properly error when dynamic = "error" page uses dynamic', async () => {
        const res = await next.fetch('/dynamic-error/static-bailout-1')
        const outputIndex = next.cliOutput.length

        expect(res.status).toBe(500)

        if (isNextStart) {
          expect(stripAnsi(next.cliOutput).substring(outputIndex)).not.toMatch(
            /Page with dynamic = "error" encountered dynamic data method on \/dynamic-error\/static-bailout-1/
          )
        }
      })
    }
  }

  it('should skip cache in draft mode', async () => {
    const draftRes = await next.fetch('/api/draft-mode?status=enable')
    const setCookie = draftRes.headers.get('set-cookie')
    const cookieHeader = { Cookie: setCookie?.split(';', 1)[0] }

    expect(cookieHeader.Cookie).toBeTruthy()

    const res = await next.fetch('/ssg-draft-mode/test-1', {
      headers: cookieHeader,
    })

    const html = await res.text()
    const $ = cheerio.load(html)
    const data1 = $('#data').text()

    expect(data1).toBeTruthy()
    expect(JSON.parse($('#draft-mode').text())).toEqual({ isEnabled: true })

    const res2 = await next.fetch('/ssg-draft-mode/test-1', {
      headers: cookieHeader,
    })

    const html2 = await res2.text()
    const $2 = cheerio.load(html2)
    const data2 = $2('#data').text()

    expect(data2).toBeTruthy()
    expect(data1).not.toBe(data2)
    expect(JSON.parse($2('#draft-mode').text())).toEqual({ isEnabled: true })
  })

  it('should handle partial-gen-params with default dynamicParams correctly', async () => {
    const res = await next.fetch('/partial-gen-params/en/first')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)
    const params = JSON.parse($('#params').text())

    expect(params).toEqual({ lang: 'en', slug: 'first' })
  })

  it('should handle partial-gen-params with layout dynamicParams = false correctly', async () => {
    for (const { path, status, params } of [
      // these checks don't work with custom memory only
      // cache handler
      ...(process.env.CUSTOM_CACHE_HANDLER
        ? []
        : [
            {
              path: '/partial-gen-params-no-additional-lang/en/first',
              status: 200,
              params: { lang: 'en', slug: 'first' },
            },
          ]),
      {
        path: '/partial-gen-params-no-additional-lang/de/first',
        status: 404,
        params: {},
      },
      {
        path: '/partial-gen-params-no-additional-lang/en/non-existent',
        status: 404,
        params: {},
      },
    ]) {
      const res = await next.fetch(path)
      expect(res.status).toBe(status)

      const html = await res.text()
      const $ = cheerio.load(html)
      const curParams = JSON.parse($('#params').text() || '{}')

      expect(curParams).toEqual(params)
    }
  })

  it('should handle partial-gen-params with page dynamicParams = false correctly', async () => {
    for (const { path, status, params } of [
      // these checks don't work with custom memory only
      // cache handler
      ...(process.env.CUSTOM_CACHE_HANDLER
        ? []
        : [
            {
              path: '/partial-gen-params-no-additional-slug/en/first',
              status: 200,
              params: { lang: 'en', slug: 'first' },
            },
          ]),
      {
        path: '/partial-gen-params-no-additional-slug/de/first',
        status: 404,
        params: {},
      },
      {
        path: '/partial-gen-params-no-additional-slug/en/non-existent',
        status: 404,
        params: {},
      },
    ]) {
      const res = await next.fetch(path)
      expect(res.status).toBe(status)

      const html = await res.text()
      const $ = cheerio.load(html)
      const curParams = JSON.parse($('#params').text() || '{}')

      expect(curParams).toEqual(params)
    }
  })

  // fetch cache in generateStaticParams needs fs for persistence
  // so doesn't behave as expected with custom in memory only
  // cache handler
  if (!process.env.CUSTOM_CACHE_HANDLER) {
    it('should honor fetch cache in generateStaticParams', async () => {
      const initialRes = await next.fetch(
        `/partial-gen-params-no-additional-lang/en/first`
      )

      expect(initialRes.status).toBe(200)

      // we can't read prerender-manifest from deployment
      if (isNextDeploy) return

      let langFetchSlug
      let slugFetchSlug

      if (isNextDev) {
        await check(() => {
          const matches = stripAnsi(next.cliOutput).match(
            /partial-gen-params fetch ([\d]{1,})/
          )

          if (matches?.[1]) {
            langFetchSlug = matches[1]
            slugFetchSlug = langFetchSlug
          }
          return langFetchSlug ? 'success' : next.cliOutput
        }, 'success')
      } else {
        // the fetch cache can potentially be a miss since
        // the generateStaticParams are executed parallel
        // in separate workers so parse value from
        // prerender-manifest
        const routes = Object.keys(prerenderManifest.routes)

        for (const route of routes) {
          const langSlug = route.match(
            /partial-gen-params-no-additional-lang\/en\/([\d]{1,})/
          )?.[1]

          if (langSlug) {
            langFetchSlug = langSlug
          }

          const slugSlug = route.match(
            /partial-gen-params-no-additional-slug\/en\/([\d]{1,})/
          )?.[1]

          if (slugSlug) {
            slugFetchSlug = slugSlug
          }
        }
      }
      require('console').log({ langFetchSlug, slugFetchSlug })

      for (const { pathname, slug } of [
        {
          pathname: '/partial-gen-params-no-additional-lang/en',
          slug: langFetchSlug,
        },
        {
          pathname: '/partial-gen-params-no-additional-slug/en',
          slug: slugFetchSlug,
        },
      ]) {
        const res = await next.fetch(`${pathname}/${slug}`)
        expect(res.status).toBe(200)
        expect(
          JSON.parse(
            cheerio
              .load(await res.text())('#params')
              .text()
          )
        ).toEqual({ lang: 'en', slug })
      }
    })
  }

  it('should honor fetch cache correctly', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/revalidate-3'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()
      const pageData2 = $('#page-data-2').text()

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/revalidate-3'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      expect($2('#page-data-2').text()).toBe(pageData2)
      expect(pageData).toBe(pageData2)
      return 'success'
    }, 'success')

    if (isNextStart) {
      expect(next.cliOutput).toContain(
        `Page "/variable-revalidate-edge/revalidate-3" is using runtime = 'edge' which is currently incompatible with dynamic = 'force-static'. Please remove either "runtime" or "force-static" for correct behavior`
      )
    }
  })

  it('should honor fetch cache correctly (edge)', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/revalidate-3'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      // the test cache handler is simple and doesn't share
      // state across workers so not guaranteed to have cache hit
      if (!(isNextDeploy && process.env.CUSTOM_CACHE_HANDLER)) {
        const layoutData = $('#layout-data').text()
        const pageData = $('#page-data').text()

        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate-edge/revalidate-3'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
      }
      return 'success'
    }, 'success')
  })

  it('should cache correctly with authorization header and revalidate', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/authorization'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/authorization'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      // this relies on ISR level cache which isn't
      // applied in dev
      if (!isNextDev) {
        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
      }
      return 'success'
    }, 'success')
  })

  it('should skip fetch cache when an authorization header is present after dynamic usage', async () => {
    const initialReq = await next.fetch(
      '/variable-revalidate/authorization/route-cookies'
    )
    const initialJson = await initialReq.json()

    await retry(async () => {
      const req = await next.fetch(
        '/variable-revalidate/authorization/route-cookies'
      )
      const json = await req.json()

      expect(json).not.toEqual(initialJson)
    })
  })

  it('should skip fetch cache when accessing request properties', async () => {
    const initialReq = await next.fetch(
      '/variable-revalidate/authorization/route-request'
    )
    const initialJson = await initialReq.json()

    await retry(async () => {
      const req = await next.fetch(
        '/variable-revalidate/authorization/route-request'
      )
      const json = await req.json()

      expect(json).not.toEqual(initialJson)
    })
  })

  it('should not cache correctly with POST method request init', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/variable-revalidate-edge/post-method-request'
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)

    const pageData2 = $('#page-data2').text()

    for (let i = 0; i < 3; i++) {
      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/post-method-request'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#page-data2').text()).not.toBe(pageData2)
    }
  })

  it('should cache correctly with post method and revalidate', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/post-method'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()
      const dataBody1 = $('#data-body1').text()
      const dataBody2 = $('#data-body2').text()
      const dataBody3 = $('#data-body3').text()
      const dataBody4 = $('#data-body4').text()
      const dataBody5 = $('#data-body5').text()

      expect(dataBody1).not.toBe(dataBody2)
      expect(dataBody2).not.toBe(dataBody3)
      expect(dataBody3).not.toBe(dataBody4)
      expect(dataBody4).not.toBe(dataBody5)

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/post-method'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      expect($2('#data-body1').text()).toBe(dataBody1)
      expect($2('#data-body2').text()).toBe(dataBody2)
      expect($2('#data-body3').text()).toBe(dataBody3)
      expect($2('#data-body4').text()).toBe(dataBody4)
      expect($2('#data-body5').text()).toBe(dataBody5)
      return 'success'
    }, 'success')
  })

  it('should cache correctly with post method and revalidate edge', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/post-method'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()
      const dataBody1 = $('#data-body1').text()
      const dataBody2 = $('#data-body2').text()
      const dataBody3 = $('#data-body3').text()
      const dataBody4 = $('#data-body4').text()

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/post-method'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      expect($2('#data-body1').text()).toBe(dataBody1)
      expect($2('#data-body2').text()).toBe(dataBody2)
      expect($2('#data-body3').text()).toBe(dataBody3)
      expect($2('#data-body4').text()).toBe(dataBody4)
      return 'success'
    }, 'success')
  })

  it('should cache correctly with POST method and revalidate', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/post-method'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/post-method'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      return 'success'
    }, 'success')
  })

  it('should cache correctly with cookie header and revalidate', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(next.url, '/variable-revalidate/cookie')
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      const res2 = await fetchViaHTTP(next.url, '/variable-revalidate/cookie')
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      // this relies on ISR level cache which isn't
      // applied in dev
      if (!isNextDev) {
        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
      }
      return 'success'
    }, 'success')
  })

  it('should cache correctly with utf8 encoding', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(next.url, '/variable-revalidate/encoding')
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      expect(JSON.parse(pageData).jp).toBe(
        '超鬼畜！激辛ボム兵スピンジャンプ　Bomb Spin Jump'
      )

      const res2 = await fetchViaHTTP(next.url, '/variable-revalidate/encoding')
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      return 'success'
    }, 'success')
  })

  it('should cache correctly with utf8 encoding edge', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/encoding'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      expect(JSON.parse(pageData).jp).toBe(
        '超鬼畜！激辛ボム兵スピンジャンプ　Bomb Spin Jump'
      )

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/encoding'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      return 'success'
    }, 'success')
  })

  it('should cache correctly handle JSON body', async () => {
    await check(async () => {
      const res = await fetchViaHTTP(next.url, '/variable-revalidate-edge/body')
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const layoutData = $('#layout-data').text()
      const pageData = $('#page-data').text()

      expect(pageData).toBe('{"hello":"world"}')

      const res2 = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/body'
      )
      expect(res2.status).toBe(200)
      const html2 = await res2.text()
      const $2 = cheerio.load(html2)

      expect($2('#layout-data').text()).toBe(layoutData)
      expect($2('#page-data').text()).toBe(pageData)
      return 'success'
    }, 'success')
  })

  it('should not throw Dynamic Server Usage error when using generateStaticParams with draftMode', async () => {
    const browserOnIndexPage = await next.browser('/ssg-draft-mode')

    const content = await browserOnIndexPage.elementByCss('#draft-mode').text()

    expect(content).toBe('{"isEnabled":false}')
  })

  it('should force SSR correctly for headers usage', async () => {
    const res = await next.fetch('/force-static', {
      headers: {
        Cookie: 'myCookie=cookieValue',
        another: 'header',
      },
    })
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect(JSON.parse($('#headers').text())).toIncludeAllMembers([
      'cookie',
      'another',
    ])
    expect(JSON.parse($('#cookies').text())).toEqual([
      {
        name: 'myCookie',
        value: 'cookieValue',
      },
    ])

    const firstTime = $('#now').text()

    if (!(global as any).isNextDev) {
      const res2 = await next.fetch('/force-static')
      expect(res2.status).toBe(200)

      const $2 = cheerio.load(await res2.text())
      expect(firstTime).not.toBe($2('#now').text())
    }
  })

  it('should allow dynamic routes to access cookies', async () => {
    for (const slug of ['books', 'frameworks']) {
      for (let i = 0; i < 2; i++) {
        let $ = await next.render$(
          `/force-dynamic-prerender/${slug}`,
          {},
          { headers: { cookie: 'session=value' } }
        )

        expect($('#slug').text()).toBe(slug)
        expect($('#cookie-result').text()).toBe('has cookie')

        $ = await next.render$(`/force-dynamic-prerender/${slug}`)

        expect($('#slug').text()).toBe(slug)
        expect($('#cookie-result').text()).toBe('no cookie')
      }
    }
  })

  it('should not error with generateStaticParams and dynamic data', async () => {
    const res = await next.fetch('/gen-params-dynamic/one')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('gen-params-dynamic/[slug]')
    expect(html).toContain('one')

    const data = cheerio.load(html)('#data').text()

    for (let i = 0; i < 5; i++) {
      const res2 = await next.fetch('/gen-params-dynamic/one')
      expect(res2.status).toBe(200)
      expect(
        cheerio
          .load(await res2.text())('#data')
          .text()
      ).not.toBe(data)
    }
  })

  it('should not error with force-dynamic and catch-all routes', async () => {
    // Regression test for https://github.com/vercel/next.js/issues/45603
    const res = await next.fetch('/force-dynamic-catch-all/slug/a')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('Dynamic catch-all route')
  })

  it('should not error with generateStaticParams and authed data on revalidate', async () => {
    const res = await next.fetch('/gen-params-dynamic-revalidate/one')
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(html).toContain('gen-params-dynamic/[slug]')
    expect(html).toContain('one')
    const initData = cheerio.load(html)('#data').text()

    await check(async () => {
      const res2 = await next.fetch('/gen-params-dynamic-revalidate/one')

      expect(res2.status).toBe(200)

      const $ = cheerio.load(await res2.text())
      expect($('#data').text()).toBeTruthy()
      expect($('#data').text()).not.toBe(initData)
      return 'success'
    }, 'success')
  })

  if (!process.env.CUSTOM_CACHE_HANDLER) {
    it('should not filter out catch-all params with repeated segments in generateStaticParams', async () => {
      const res1 = await next.fetch('/gen-params-catch-all-unique/foo/foo')
      expect(res1.status).toBe(200)
      const res2 = await next.fetch('/gen-params-catch-all-unique/foo/bar')
      expect(res2.status).toBe(200)
    })

    it('should honor dynamic = "force-static" correctly', async () => {
      const res = await next.fetch('/force-static/first')
      expect(res.status).toBe(200)

      const html = await res.text()
      const $ = cheerio.load(html)

      expect(JSON.parse($('#params').text())).toEqual({ slug: 'first' })
      expect(JSON.parse($('#headers').text())).toEqual([])
      expect(JSON.parse($('#cookies').text())).toEqual([])

      const firstTime = $('#now').text()

      if (!(global as any).isNextDev) {
        const res2 = await next.fetch('/force-static/first')
        expect(res2.status).toBe(200)

        const $2 = cheerio.load(await res2.text())
        expect(firstTime).toBe($2('#now').text())
      }
    })

    it('should honor dynamic = "force-static" correctly (lazy)', async () => {
      const res = await next.fetch('/force-static/random')
      expect(res.status).toBe(200)

      const html = await res.text()
      const $ = cheerio.load(html)

      expect(JSON.parse($('#params').text())).toEqual({ slug: 'random' })
      expect(JSON.parse($('#headers').text())).toEqual([])
      expect(JSON.parse($('#cookies').text())).toEqual([])

      const firstTime = $('#now').text()

      if (!(global as any).isNextDev) {
        const res2 = await next.fetch('/force-static/random')
        expect(res2.status).toBe(200)

        const $2 = cheerio.load(await res2.text())
        expect(firstTime).toBe($2('#now').text())
      }
    })
  }

  // since we aren't leveraging fs cache with custom handler
  // then these will 404 as they are cache misses
  if (!(isNextStart && process.env.CUSTOM_CACHE_HANDLER)) {
    it('should handle dynamicParams: false correctly', async () => {
      const validParams = ['tim', 'seb', 'styfle']

      for (const param of validParams) {
        const res = await next.fetch(`/blog/${param}`, {
          redirect: 'manual',
        })
        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        expect(JSON.parse($('#params').text())).toEqual({
          author: param,
        })
        expect($('#page').text()).toBe('/blog/[author]')
      }
      const invalidParams = ['timm', 'non-existent']

      for (const param of invalidParams) {
        const invalidRes = await next.fetch(`/blog/${param}`, {
          redirect: 'manual',
        })
        expect(invalidRes.status).toBe(404)
        expect(await invalidRes.text()).toContain('page could not be found')
      }
    })
  }

  it('should work with forced dynamic path', async () => {
    for (const slug of ['first', 'second']) {
      const res = await next.fetch(`/dynamic-no-gen-params-ssr/${slug}`, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(`${slug}`)
    }
  })

  it('should work with dynamic path no generateStaticParams', async () => {
    for (const slug of ['first', 'second']) {
      const res = await next.fetch(`/dynamic-no-gen-params/${slug}`, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(`${slug}`)
    }
  })

  it('should handle dynamicParams: true correctly', async () => {
    const paramsToCheck = [
      {
        author: 'tim',
        slug: 'first-post',
      },
      {
        author: 'seb',
        slug: 'second-post',
      },
      {
        author: 'styfle',
        slug: 'first-post',
      },
      {
        author: 'new-author',
        slug: 'first-post',
      },
    ]

    for (const params of paramsToCheck) {
      const res = await next.fetch(`/blog/${params.author}/${params.slug}`, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      expect(JSON.parse($('#params').text())).toEqual(params)
      expect($('#page').text()).toBe('/blog/[author]/[slug]')
    }
  })

  // since we aren't leveraging fs cache with custom handler
  // then these will 404 as they are cache misses
  if (!(isNextStart && process.env.CUSTOM_CACHE_HANDLER)) {
    it('should navigate to static path correctly', async () => {
      const browser = await next.browser('/blog/tim')
      await browser.eval('window.beforeNav = 1')

      expect(
        await browser.eval('document.documentElement.innerHTML')
      ).toContain('/blog/[author]')
      await browser.elementByCss('#author-2').click()

      await check(async () => {
        const params = JSON.parse(await browser.elementByCss('#params').text())
        return params.author === 'seb' ? 'found' : params
      }, 'found')

      expect(await browser.eval('window.beforeNav')).toBe(1)
      await browser.elementByCss('#author-1-post-1').click()

      await check(async () => {
        const params = JSON.parse(await browser.elementByCss('#params').text())
        return params.author === 'tim' && params.slug === 'first-post'
          ? 'found'
          : params
      }, 'found')

      expect(await browser.eval('window.beforeNav')).toBe(1)
      await browser.back()

      await check(async () => {
        const params = JSON.parse(await browser.elementByCss('#params').text())
        return params.author === 'seb' ? 'found' : params
      }, 'found')

      expect(await browser.eval('window.beforeNav')).toBe(1)
    })
  }

  it('should ssr dynamically when detected automatically with fetch cache option', async () => {
    const pathname = '/ssr-auto/cache-no-store'
    const initialRes = await next.fetch(pathname, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe(pathname)
    const initialDate = initial$('#date').text()

    expect(initialHtml).toContain('Example Domain')

    const secondRes = await next.fetch(pathname, {
      redirect: 'manual',
    })
    expect(secondRes.status).toBe(200)

    const secondHtml = await secondRes.text()
    const second$ = cheerio.load(secondHtml)

    expect(second$('#page').text()).toBe(pathname)
    const secondDate = second$('#date').text()

    expect(secondHtml).toContain('Example Domain')
    expect(secondDate).not.toBe(initialDate)
  })

  it('should render not found pages correctly and fallback to the default one', async () => {
    const res = await next.fetch(`/blog/shu/hi`, {
      redirect: 'manual',
    })

    const html = await res.text()
    expect(html).toInclude('"noindex"')
    expect(html).toInclude('This page could not be found.')

    if (process.env.__NEXT_CACHE_COMPONENTS && !isNextDev) {
      expect(res.status).toBe(200)
    } else {
      expect(res.status).toBe(404)
    }
  })

  // TODO-APP: support fetch revalidate case for dynamic rendering
  it.skip('should ssr dynamically when detected automatically with fetch revalidate option', async () => {
    const pathname = '/ssr-auto/fetch-revalidate-zero'
    const initialRes = await next.fetch(pathname, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe(pathname)
    const initialDate = initial$('#date').text()

    expect(initialHtml).toContain('Example Domain')

    const secondRes = await next.fetch(pathname, {
      redirect: 'manual',
    })
    expect(secondRes.status).toBe(200)

    const secondHtml = await secondRes.text()
    const second$ = cheerio.load(secondHtml)

    expect(second$('#page').text()).toBe(pathname)
    const secondDate = second$('#date').text()

    expect(secondHtml).toContain('Example Domain')
    expect(secondDate).not.toBe(initialDate)
  })

  it('should ssr dynamically when forced via config', async () => {
    const initialRes = await next.fetch('/ssr-forced', {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe('/ssr-forced')
    const initialDate = initial$('#date').text()

    const secondRes = await next.fetch('/ssr-forced', {
      redirect: 'manual',
    })
    expect(secondRes.status).toBe(200)

    const secondHtml = await secondRes.text()
    const second$ = cheerio.load(secondHtml)

    expect(second$('#page').text()).toBe('/ssr-forced')
    const secondDate = second$('#date').text()

    expect(secondDate).not.toBe(initialDate)
  })

  describe('useSearchParams', () => {
    describe('client', () => {
      it('should bailout to client rendering - with suspense boundary', async () => {
        const url =
          '/hooks/use-search-params/with-suspense?first=value&second=other&third'
        const browser = await next.browser(url)

        expect(await browser.elementByCss('#params-first').text()).toBe('value')
        expect(await browser.elementByCss('#params-second').text()).toBe(
          'other'
        )
        expect(
          await browser
            .elementByCss('#params-third', { state: 'attached' })
            .text()
        ).toBe('')
        expect(await browser.elementByCss('#params-not-real').text()).toBe(
          'N/A'
        )

        const $ = await next.render$(url)
        // dynamic page doesn't have bail out
        expect($('html#__next_error__').length).toBe(0)
        expect($('meta[content=noindex]').length).toBe(0)
      })

      it.skip('should have empty search params on force-static', async () => {
        const browser = await next.browser(
          '/hooks/use-search-params/force-static?first=value&second=other&third'
        )

        expect(await browser.elementByCss('#params-first').text()).toBe('N/A')
        expect(await browser.elementByCss('#params-second').text()).toBe('N/A')
        expect(await browser.elementByCss('#params-third').text()).toBe('N/A')
        expect(await browser.elementByCss('#params-not-real').text()).toBe(
          'N/A'
        )

        await browser.elementById('to-use-search-params').click()
        await browser.waitForElementByCss('#hooks-use-search-params')

        // Should not be empty after navigating to another page with useSearchParams
        expect(await browser.elementByCss('#params-first').text()).toBe('1')
        expect(await browser.elementByCss('#params-second').text()).toBe('2')
        expect(await browser.elementByCss('#params-third').text()).toBe('3')
        expect(await browser.elementByCss('#params-not-real').text()).toBe(
          'N/A'
        )
      })

      // TODO-APP: re-enable after investigating rewrite params
      if (!(global as any).isNextDeploy) {
        it('should have values from canonical url on rewrite', async () => {
          const browser = await next.browser(
            '/rewritten-use-search-params?first=a&second=b&third=c'
          )

          expect(await browser.elementByCss('#params-first').text()).toBe('a')
          expect(await browser.elementByCss('#params-second').text()).toBe('b')
          expect(await browser.elementByCss('#params-third').text()).toBe('c')
          expect(await browser.elementByCss('#params-not-real').text()).toBe(
            'N/A'
          )
        })
      }
    })
    // Don't run these tests in development mode since they won't be statically generated
    if (!isNextDev) {
      describe('server response', () => {
        it('should bailout to client rendering - with suspense boundary', async () => {
          const res = await next.fetch('/hooks/use-search-params/with-suspense')
          const html = await res.text()
          expect(html).toInclude('<p>search params suspense</p>')
        })

        it.skip('should have empty search params on force-static', async () => {
          const res = await next.fetch(
            '/hooks/use-search-params/force-static?first=value&second=other&third'
          )
          const html = await res.text()

          // Should not bail out to client rendering
          expect(html).not.toInclude('<p>search params suspense</p>')

          // Use empty search params instead
          const $ = cheerio.load(html)
          expect($('#params-first').text()).toBe('N/A')
          expect($('#params-second').text()).toBe('N/A')
          expect($('#params-third').text()).toBe('N/A')
          expect($('#params-not-real').text()).toBe('N/A')
        })
      })
    }
  })

  describe('usePathname', () => {
    it('should have the correct values', async () => {
      const $ = await next.render$('/hooks/use-pathname/slug')
      expect($('#pathname').text()).toContain('/hooks/use-pathname/slug')

      const browser = await next.browser('/hooks/use-pathname/slug')

      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/hooks/use-pathname/slug'
      )
    })

    it('should have values from canonical url on rewrite', async () => {
      const browser = await next.browser('/rewritten-use-pathname')

      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/rewritten-use-pathname'
      )
    })
  })

  describe('unstable_noStore', () => {
    it('should opt-out of static optimization', async () => {
      const res = await next.fetch('/no-store/dynamic')
      const html = await res.text()
      const data = cheerio.load(html)('#uncached-data').text()
      const res2 = await next.fetch('/no-store/dynamic')
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#uncached-data').text()

      expect(data).not.toEqual(data2)
    })

    it('should not opt-out of static optimization when used in next/cache', async () => {
      const res = await next.fetch('/no-store/static')
      const html = await res.text()
      const data = cheerio.load(html)('#data').text()
      const res2 = await next.fetch('/no-store/static')
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#data').text()

      expect(data).toEqual(data2)
    })
  })

  describe('unstable_cache', () => {
    it('should retrieve the same value on second request', async () => {
      const res = await next.fetch('/unstable-cache/dynamic')
      const html = await res.text()
      const data = cheerio.load(html)('#cached-data').text()
      const res2 = await next.fetch('/unstable-cache/dynamic')
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#cached-data').text()

      expect(data).toEqual(data2)
    })

    it('should bypass cache in draft mode', async () => {
      const draftRes = await next.fetch('/api/draft-mode?status=enable')
      const setCookie = draftRes.headers.get('set-cookie')
      const cookieHeader = { Cookie: setCookie?.split(';', 1)[0] }

      expect(cookieHeader.Cookie).toBeTruthy()

      const res = await next.fetch('/unstable-cache/dynamic', {
        headers: cookieHeader,
      })
      const html = await res.text()
      const data = cheerio.load(html)('#cached-data').text()
      const res2 = await next.fetch('/unstable-cache/dynamic', {
        headers: cookieHeader,
      })
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#cached-data').text()

      expect(data).not.toEqual(data2)
    })

    it('should not cache new result in draft mode', async () => {
      const draftRes = await next.fetch('/api/draft-mode?status=enable')
      const setCookie = draftRes.headers.get('set-cookie')
      const cookieHeader = { Cookie: setCookie?.split(';', 1)[0] }

      expect(cookieHeader.Cookie).toBeTruthy()

      const res = await next.fetch('/unstable-cache/dynamic', {
        headers: cookieHeader,
      })
      const html = await res.text()
      const data = cheerio.load(html)('#cached-data').text()

      const res2 = await next.fetch('/unstable-cache/dynamic')
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#cached-data').text()

      expect(data).not.toEqual(data2)
    })

    it('should be able to read the draft mode status', async () => {
      let $ = await next.render$('/unstable-cache/dynamic')
      expect($('#draft-mode-enabled').text()).toBe('draft mode enabled: false')

      const draftRes = await next.fetch('/api/draft-mode?status=enable')
      const setCookie = draftRes.headers.get('set-cookie')
      const cookieHeader = { Cookie: setCookie?.split(';', 1)[0] }

      $ = await next.render$('/unstable-cache/dynamic', undefined, {
        headers: cookieHeader,
      })

      expect($('#draft-mode-enabled').text()).toBe('draft mode enabled: true')
    })

    it('should not error when retrieving the value undefined', async () => {
      const res = await next.fetch('/unstable-cache/dynamic-undefined')
      const html = await res.text()
      const data = cheerio.load(html)('#cached-data').text()
      const res2 = await next.fetch('/unstable-cache/dynamic-undefined')
      const html2 = await res2.text()
      const data2 = cheerio.load(html2)('#cached-data').text()

      expect(data).toEqual(data2)
      expect(data).toEqual('typeof cachedData: undefined')
    })

    it.each(['no-store', 'no-cache'])(
      'should not error when calling a fetch %s',
      async (cache) => {
        const browser = await next.browser(`/unstable-cache/fetch/${cache}`)

        try {
          const first = await browser.waitForElementByCss('#data').text()
          expect(first).not.toBe('')

          // Ensure the data is the same after 3 refreshes.
          for (let i = 0; i < 3; i++) {
            await browser.refresh()
            const refreshed = await browser.waitForElementByCss('#data').text()
            expect(refreshed).toEqual(first)
          }
        } finally {
          await browser.close()
        }
      }
    )
  })

  it('should keep querystring on static page', async () => {
    const browser = await next.browser('/blog/tim?message=hello-world')
    const checkUrl = async () =>
      expect(await browser.url()).toBe(
        next.url + '/blog/tim?message=hello-world'
      )

    checkUrl()
    await waitFor(1000)
    checkUrl()
  })

  if (process.env.CUSTOM_CACHE_HANDLER && !isNextDeploy) {
    it('should have logs from cache-handler', () => {
      expect(next.cliOutput).toContain('initialized custom cache-handler')
      expect(next.cliOutput).toContain('cache-handler get')
      expect(next.cliOutput).toContain('cache-handler set')
    })
  }

  describe('Incremental cache limits', () => {
    if (process.env.CUSTOM_CACHE_HANDLER && isNextStart) {
      it('should cache large data when using custom cache handler and force-cache mode', async () => {
        const resp1 = await next.fetch('/force-cache/large-data')
        const resp1Text = await resp1.text()
        const dom1 = cheerio.load(resp1Text)

        const resp2 = await next.fetch('/force-cache/large-data')
        const resp2Text = await resp2.text()
        const dom2 = cheerio.load(resp2Text)

        const data1 = dom1('#now').text()
        const data2 = dom2('#now').text()
        expect(data1 && data2).toBeTruthy()
        expect(data1).toEqual(data2)
      })
    }
    if (!process.env.CUSTOM_CACHE_HANDLER && isNextStart) {
      it('should load data only at build time even if response data size is greater than 2MB and FetchCache is possible', async () => {
        const cliOutputStart = next.cliOutput.length
        const resp1 = await next.fetch('/force-cache/large-data')
        const resp1Text = await resp1.text()
        const dom1 = cheerio.load(resp1Text)

        const resp2 = await next.fetch('/force-cache/large-data')
        const resp2Text = await resp2.text()
        const dom2 = cheerio.load(resp2Text)

        const data1 = dom1('#now').text()
        const data2 = dom2('#now').text()
        expect(data1 && data2).toBeTruthy()
        expect(data1).toEqual(data2)
        expect(
          next.cliOutput.substring(cliOutputStart).match(/Load data/g)
        ).toBeNull()
      })
    }
    if (!process.env.CUSTOM_CACHE_HANDLER && isNextDev) {
      it('should not cache request if response data size is greater than 2MB and FetchCache is possible in development mode', async () => {
        const cliOutputStart = next.cliOutput.length
        const resp1 = await next.fetch('/force-cache/large-data')
        const resp1Text = await resp1.text()
        const dom1 = cheerio.load(resp1Text)

        const resp2 = await next.fetch('/force-cache/large-data')
        const resp2Text = await resp2.text()
        const dom2 = cheerio.load(resp2Text)

        const data1 = dom1('#now').text()
        const data2 = dom2('#now').text()
        expect(data1 && data2).toBeTruthy()
        expect(data1).not.toEqual(data2)

        await check(async () => {
          expect(
            next.cliOutput.substring(cliOutputStart).match(/Load data/g).length
          ).toBe(2)
          expect(stripAnsi(next.cliOutput.substring(cliOutputStart))).toMatch(
            /Failed to set Next.js data cache for http:\/\/localhost:.*?\/api\/large-data, items over 2MB can not be cached/
          )
          return 'success'
        }, 'success')
      })
    }
    if (process.env.CUSTOM_CACHE_HANDLER && isNextDev) {
      it('should cache request if response data size is greater than 2MB in development mode', async () => {
        const cliOutputStart = next.cliOutput.length
        const resp1 = await next.fetch('/force-cache/large-data')
        const resp1Text = await resp1.text()
        const dom1 = cheerio.load(resp1Text)

        const resp2 = await next.fetch('/force-cache/large-data')
        const resp2Text = await resp2.text()
        const dom2 = cheerio.load(resp2Text)

        const data1 = dom1('#now').text()
        const data2 = dom2('#now').text()
        expect(data1 && data2).toBeTruthy()
        expect(data1).toEqual(data2)

        await check(async () => {
          expect(
            next.cliOutput.substring(cliOutputStart).match(/Load data/g).length
          ).toBe(1)
          return 'success'
        }, 'success')

        expect(next.cliOutput.substring(cliOutputStart)).not.toMatch(
          /Failed to set Next.js data cache for http:\/\/localhost:.*?\/api\/large-data, items over 2MB can not be cached/
        )
      })
    }
  })

  it('should build dynamic param with edge runtime correctly', async () => {
    const browser = await next.browser('/dynamic-param-edge/hello')
    expect(await browser.elementByCss('#slug').text()).toBe('hello')
  })

  describe('updateTag/revalidateTag', () => {
    it('should throw error when updateTag is called in route handler', async () => {
      const res = await next.fetch('/api/update-tag-error')
      const data = await res.json()

      expect(data.error).toContain(
        'updateTag can only be called from within a Server Action'
      )
    })

    it('should successfully update tag when called from server action', async () => {
      // First fetch to get initial data
      const browser = await next.browser('/update-tag-test')
      const initialData = JSON.parse(await browser.elementByCss('#data').text())

      await retry(async () => {
        // Click update button to trigger server action with updateTag
        await browser.elementByCss('#update-button').click()

        // Refresh the page to see if cache was invalidated
        await browser.refresh()
        const newData = JSON.parse(await browser.elementByCss('#data').text())

        // Data should be different after updateTag (immediate expiration)
        expect(newData).not.toEqual(initialData)
      })
    })

    it('revalidateTag work with max profile in server actions', async () => {
      // First fetch to get initial data
      const browser = await next.browser('/update-tag-test')
      const initialData = JSON.parse(await browser.elementByCss('#data').text())

      // Click revalidate button to trigger server action with revalidateTag(..., 'max')
      await browser.elementByCss('#revalidate-button').click()

      // The behavior with 'max' profile would be stale-while-revalidate
      // Initial request after revalidation might still show stale data
      let dataAfterRevalidate
      await retry(async () => {
        await browser.refresh()
        dataAfterRevalidate = JSON.parse(
          await browser.elementByCss('#data').text()
        )

        expect(dataAfterRevalidate).toBeDefined()
        expect(dataAfterRevalidate).not.toBe(initialData)
      })

      if (isNextStart) {
        // give second so tag isn't still stale state
        await waitFor(1000)

        const res1 = await next.fetch('/update-tag-test')
        const body1 = await res1.text()
        const cacheHeader1 = res1.headers.get('x-nextjs-cache')

        expect(res1.status).toBe(200)
        expect(cacheHeader1).toBeDefined()
        expect(cacheHeader1).not.toBe('MISS')

        const res2 = await next.fetch('/update-tag-test')
        const body2 = await res2.text()
        const cacheHeader2 = res2.headers.get('x-nextjs-cache')

        expect(res2.status).toBe(200)
        expect(cacheHeader2).toBeDefined()
        expect(cacheHeader2).not.toBe('MISS')
        expect(body1).toBe(body2)
      }
    })

    // Runtime logs aren't queryable in deploy mode
    if (!isNextDeploy) {
      it('should show deprecation warning for revalidateTag without second argument', async () => {
        const cliOutputStart = next.cliOutput.length

        const browser = await next.browser('/update-tag-test')

        await retry(async () => {
          // Click deprecated button to trigger server action with revalidateTag (no second arg)
          await browser.elementByCss('#deprecated-button').click()
          const output = next.cliOutput.substring(cliOutputStart)
          expect(output).toContain(
            '"revalidateTag" without the second argument is now deprecated'
          )
        })
      })
    }
  })
})
