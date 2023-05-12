import globOrig from 'glob'
import cheerio from 'cheerio'
import { promisify } from 'util'
import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'
import { check, fetchViaHTTP, normalizeRegEx, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const glob = promisify(globOrig)

createNextDescribe(
  'app-dir static/dynamic handling',
  {
    files: __dirname,
    env: {
      NEXT_DEBUG_BUILD: '1',
      NEXT_PRIVATE_DEBUG_CACHE: '1',
      ...(process.env.CUSTOM_CACHE_HANDLER
        ? {
            CUSTOM_CACHE_HANDLER: process.env.CUSTOM_CACHE_HANDLER,
          }
        : {}),
    },
  },
  ({ next, isNextDev: isDev, isNextStart, isNextDeploy }) => {
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
        const initialHtml = await res.text()
        const initial$ = isApi ? undefined : cheerio.load(initialHtml)
        prevData = JSON.parse(initial$('#props').text())
      }

      expect(prevData.data.random).toBeTruthy()

      await check(async () => {
        res = await next.fetch(pathname)
        expect(res.status).toBe(200)
        let curData

        if (isApi) {
          curData = await res.json()
        } else {
          const curHtml = await res.text()
          const cur$ = cheerio.load(curHtml)
          curData = JSON.parse(cur$('#props').text())
        }

        try {
          expect(curData.data.random).toBeTruthy()
          expect(curData.data.random).toBe(prevData.data.random)
        } finally {
          prevData = curData
        }
        return 'success'
      }, 'success')
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

    if (isDev) {
      it('should error correctly for invalid params from generateStaticParams', async () => {
        await next.patchFile(
          'app/invalid/[slug]/page.js',
          `
            export function generateStaticParams() {
              return [{slug: { invalid: true }}]
            }
          `
        )
        const html = await next.render('/invalid/first')
        await next.deleteFile('app/invalid/[slug]/page.js')
        expect(html).toContain(
          'A required parameter (slug) was not provided as a string received object'
        )
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
          const initRes = await next.fetch(
            '/variable-revalidate/revalidate-360'
          )
          const html = await initRes.text()
          const $ = cheerio.load(html)
          const initLayoutData = $('#layout-data').text()
          const initPageData = $('#page-data').text()

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

            const newRes = await next.fetch(
              '/variable-revalidate/revalidate-360'
            )
            const newHtml = await newRes.text()
            const new$ = cheerio.load(newHtml)
            const newLayoutData = new$('#layout-data').text()
            const newPageData = new$('#page-data').text()

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
          const $ = await next.render$(
            '/variable-config-revalidate/revalidate-3'
          )
          prevInitialDate = $('#date').text()
          prevInitialRandomData = $('#random-data').text()

          expect(prevInitialDate).not.toBe(initialDate)
          expect(prevInitialRandomData).not.toBe(initialRandomData)
          return 'success'
        }, 'success')

        // the date should revalidate first after 3 seconds
        // while the fetch data stays in place for 9 seconds
        await check(async () => {
          const $ = await next.render$(
            '/variable-config-revalidate/revalidate-3'
          )
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
      it('should output HTML/RSC files for static paths', async () => {
        const files = (
          await glob('**/*', {
            cwd: join(next.testDir, '.next/server/app'),
          })
        )
          .filter((file) => file.match(/.*\.(js|html|rsc)$/))
          .map((file) => {
            return file.replace(
              /partial-gen-params-no-additional-([\w]{1,})\/([\w]{1,})\/([\d]{1,})/,
              'partial-gen-params-no-additional-$1/$2/RAND'
            )
          })

        expect(files).toEqual([
          '(new)/custom/page.js',
          'api/revalidate-path-edge/route.js',
          'api/revalidate-path-node/route.js',
          'api/revalidate-tag-edge/route.js',
          'api/revalidate-tag-node/route.js',
          'blog/[author]/[slug]/page.js',
          'blog/[author]/page.js',
          'blog/seb.html',
          'blog/seb.rsc',
          'blog/seb/second-post.html',
          'blog/seb/second-post.rsc',
          'blog/styfle.html',
          'blog/styfle.rsc',
          'blog/styfle/first-post.html',
          'blog/styfle/first-post.rsc',
          'blog/styfle/second-post.html',
          'blog/styfle/second-post.rsc',
          'blog/tim.html',
          'blog/tim.rsc',
          'blog/tim/first-post.html',
          'blog/tim/first-post.rsc',
          'default-cache/page.js',
          'dynamic-error/[id]/page.js',
          'dynamic-no-gen-params-ssr/[slug]/page.js',
          'dynamic-no-gen-params/[slug]/page.js',
          'fetch-no-cache/page.js',
          'flight/[slug]/[slug2]/page.js',
          'force-cache.html',
          'force-cache.rsc',
          'force-cache/page.js',
          'force-dynamic-catch-all/[slug]/[[...id]]/page.js',
          'force-dynamic-no-prerender/[id]/page.js',
          'force-dynamic-prerender/[slug]/page.js',
          'force-no-store/page.js',
          'force-static/[slug]/page.js',
          'force-static/first.html',
          'force-static/first.rsc',
          'force-static/page.js',
          'force-static/second.html',
          'force-static/second.rsc',
          'gen-params-dynamic-revalidate/[slug]/page.js',
          'gen-params-dynamic-revalidate/one.html',
          'gen-params-dynamic-revalidate/one.rsc',
          'gen-params-dynamic/[slug]/page.js',
          'hooks/use-pathname/[slug]/page.js',
          'hooks/use-pathname/slug.html',
          'hooks/use-pathname/slug.rsc',
          'hooks/use-search-params.html',
          'hooks/use-search-params.rsc',
          'hooks/use-search-params/force-static.html',
          'hooks/use-search-params/force-static.rsc',
          'hooks/use-search-params/force-static/page.js',
          'hooks/use-search-params/page.js',
          'hooks/use-search-params/with-suspense.html',
          'hooks/use-search-params/with-suspense.rsc',
          'hooks/use-search-params/with-suspense/page.js',
          'index.html',
          'index.rsc',
          'page.js',
          'partial-gen-params-no-additional-lang/[lang]/[slug]/page.js',
          'partial-gen-params-no-additional-lang/en/RAND.html',
          'partial-gen-params-no-additional-lang/en/RAND.rsc',
          'partial-gen-params-no-additional-lang/en/first.html',
          'partial-gen-params-no-additional-lang/en/first.rsc',
          'partial-gen-params-no-additional-lang/en/second.html',
          'partial-gen-params-no-additional-lang/en/second.rsc',
          'partial-gen-params-no-additional-lang/fr/RAND.html',
          'partial-gen-params-no-additional-lang/fr/RAND.rsc',
          'partial-gen-params-no-additional-lang/fr/first.html',
          'partial-gen-params-no-additional-lang/fr/first.rsc',
          'partial-gen-params-no-additional-lang/fr/second.html',
          'partial-gen-params-no-additional-lang/fr/second.rsc',
          'partial-gen-params-no-additional-slug/[lang]/[slug]/page.js',
          'partial-gen-params-no-additional-slug/en/RAND.html',
          'partial-gen-params-no-additional-slug/en/RAND.rsc',
          'partial-gen-params-no-additional-slug/en/first.html',
          'partial-gen-params-no-additional-slug/en/first.rsc',
          'partial-gen-params-no-additional-slug/en/second.html',
          'partial-gen-params-no-additional-slug/en/second.rsc',
          'partial-gen-params-no-additional-slug/fr/RAND.html',
          'partial-gen-params-no-additional-slug/fr/RAND.rsc',
          'partial-gen-params-no-additional-slug/fr/first.html',
          'partial-gen-params-no-additional-slug/fr/first.rsc',
          'partial-gen-params-no-additional-slug/fr/second.html',
          'partial-gen-params-no-additional-slug/fr/second.rsc',
          'partial-gen-params/[lang]/[slug]/page.js',
          'route-handler-edge/revalidate-360/route.js',
          'route-handler/post/route.js',
          'route-handler/revalidate-360-isr/route.js',
          'route-handler/revalidate-360/route.js',
          'route-handler/static-cookies/route.js',
          'ssg-draft-mode.html',
          'ssg-draft-mode.rsc',
          'ssg-draft-mode/[[...route]]/page.js',
          'ssg-draft-mode/test-2.html',
          'ssg-draft-mode/test-2.rsc',
          'ssg-draft-mode/test.html',
          'ssg-draft-mode/test.rsc',
          'ssr-auto/cache-no-store/page.js',
          'ssr-auto/fetch-revalidate-zero/page.js',
          'ssr-forced/page.js',
          'static-to-dynamic-error-forced/[id]/page.js',
          'static-to-dynamic-error/[id]/page.js',
          'variable-config-revalidate/revalidate-3.html',
          'variable-config-revalidate/revalidate-3.rsc',
          'variable-config-revalidate/revalidate-3/page.js',
          'variable-revalidate-edge/body/page.js',
          'variable-revalidate-edge/encoding/page.js',
          'variable-revalidate-edge/no-store/page.js',
          'variable-revalidate-edge/post-method-request/page.js',
          'variable-revalidate-edge/post-method/page.js',
          'variable-revalidate-edge/revalidate-3/page.js',
          'variable-revalidate/authorization.html',
          'variable-revalidate/authorization.rsc',
          'variable-revalidate/authorization/page.js',
          'variable-revalidate/cookie.html',
          'variable-revalidate/cookie.rsc',
          'variable-revalidate/cookie/page.js',
          'variable-revalidate/encoding.html',
          'variable-revalidate/encoding.rsc',
          'variable-revalidate/encoding/page.js',
          'variable-revalidate/no-store/page.js',
          'variable-revalidate/post-method-request/page.js',
          'variable-revalidate/post-method.html',
          'variable-revalidate/post-method.rsc',
          'variable-revalidate/post-method/page.js',
          'variable-revalidate/revalidate-3.html',
          'variable-revalidate/revalidate-3.rsc',
          'variable-revalidate/revalidate-3/page.js',
          'variable-revalidate/revalidate-360-isr.html',
          'variable-revalidate/revalidate-360-isr.rsc',
          'variable-revalidate/revalidate-360-isr/page.js',
          'variable-revalidate/revalidate-360/page.js',
          'variable-revalidate/status-code/page.js',
        ])
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
        expect(curManifest.routes).toEqual({
          '/': {
            initialRevalidateSeconds: false,
            srcRoute: '/',
            dataRoute: '/index.rsc',
          },
          '/blog/tim': {
            initialRevalidateSeconds: 10,
            srcRoute: '/blog/[author]',
            dataRoute: '/blog/tim.rsc',
          },
          '/blog/seb': {
            initialRevalidateSeconds: 10,
            srcRoute: '/blog/[author]',
            dataRoute: '/blog/seb.rsc',
          },
          '/blog/styfle': {
            initialRevalidateSeconds: 10,
            srcRoute: '/blog/[author]',
            dataRoute: '/blog/styfle.rsc',
          },
          '/blog/tim/first-post': {
            initialRevalidateSeconds: false,
            srcRoute: '/blog/[author]/[slug]',
            dataRoute: '/blog/tim/first-post.rsc',
          },
          '/blog/seb/second-post': {
            initialRevalidateSeconds: false,
            srcRoute: '/blog/[author]/[slug]',
            dataRoute: '/blog/seb/second-post.rsc',
          },
          '/blog/styfle/first-post': {
            initialRevalidateSeconds: false,
            srcRoute: '/blog/[author]/[slug]',
            dataRoute: '/blog/styfle/first-post.rsc',
          },
          '/blog/styfle/second-post': {
            initialRevalidateSeconds: false,
            srcRoute: '/blog/[author]/[slug]',
            dataRoute: '/blog/styfle/second-post.rsc',
          },
          '/force-cache': {
            dataRoute: '/force-cache.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/force-cache',
          },
          '/hooks/use-pathname/slug': {
            dataRoute: '/hooks/use-pathname/slug.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/hooks/use-pathname/[slug]',
          },
          '/hooks/use-search-params': {
            dataRoute: '/hooks/use-search-params.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/hooks/use-search-params',
          },
          '/hooks/use-search-params/force-static': {
            dataRoute: '/hooks/use-search-params/force-static.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/hooks/use-search-params/force-static',
          },
          '/hooks/use-search-params/with-suspense': {
            dataRoute: '/hooks/use-search-params/with-suspense.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/hooks/use-search-params/with-suspense',
          },
          '/partial-gen-params-no-additional-lang/en/RAND': {
            dataRoute: '/partial-gen-params-no-additional-lang/en/RAND.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-lang/en/first': {
            dataRoute: '/partial-gen-params-no-additional-lang/en/first.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-lang/en/second': {
            dataRoute: '/partial-gen-params-no-additional-lang/en/second.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-lang/fr/RAND': {
            dataRoute: '/partial-gen-params-no-additional-lang/fr/RAND.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-lang/fr/first': {
            dataRoute: '/partial-gen-params-no-additional-lang/fr/first.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-lang/fr/second': {
            dataRoute: '/partial-gen-params-no-additional-lang/fr/second.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-lang/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/en/RAND': {
            dataRoute: '/partial-gen-params-no-additional-slug/en/RAND.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/en/first': {
            dataRoute: '/partial-gen-params-no-additional-slug/en/first.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/en/second': {
            dataRoute: '/partial-gen-params-no-additional-slug/en/second.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/fr/RAND': {
            dataRoute: '/partial-gen-params-no-additional-slug/fr/RAND.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/fr/first': {
            dataRoute: '/partial-gen-params-no-additional-slug/fr/first.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/partial-gen-params-no-additional-slug/fr/second': {
            dataRoute: '/partial-gen-params-no-additional-slug/fr/second.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/partial-gen-params-no-additional-slug/[lang]/[slug]',
          },
          '/ssg-draft-mode': {
            dataRoute: '/ssg-draft-mode.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-draft-mode/[[...route]]',
          },
          '/ssg-draft-mode/test': {
            dataRoute: '/ssg-draft-mode/test.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-draft-mode/[[...route]]',
          },
          '/ssg-draft-mode/test-2': {
            dataRoute: '/ssg-draft-mode/test-2.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-draft-mode/[[...route]]',
          },
          '/force-static/first': {
            dataRoute: '/force-static/first.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/force-static/[slug]',
          },
          '/force-static/second': {
            dataRoute: '/force-static/second.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/force-static/[slug]',
          },
          '/gen-params-dynamic-revalidate/one': {
            dataRoute: '/gen-params-dynamic-revalidate/one.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/gen-params-dynamic-revalidate/[slug]',
          },
          '/route-handler/revalidate-360-isr': {
            dataRoute: null,
            initialHeaders: {
              'content-type': 'application/json',
              'x-next-cache-tags':
                'thankyounext,/route-handler/revalidate-360-isr/route',
            },
            initialRevalidateSeconds: 10,
            srcRoute: '/route-handler/revalidate-360-isr',
          },
          '/route-handler/static-cookies': {
            dataRoute: null,
            initialHeaders: {
              'set-cookie': 'theme=light; Path=/,my_company=ACME; Path=/',
              'x-next-cache-tags': '/route-handler/static-cookies/route',
            },
            initialRevalidateSeconds: false,
            srcRoute: '/route-handler/static-cookies',
          },
          '/variable-config-revalidate/revalidate-3': {
            dataRoute: '/variable-config-revalidate/revalidate-3.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-config-revalidate/revalidate-3',
          },
          '/variable-revalidate/authorization': {
            dataRoute: '/variable-revalidate/authorization.rsc',
            initialRevalidateSeconds: 10,
            srcRoute: '/variable-revalidate/authorization',
          },
          '/variable-revalidate/cookie': {
            dataRoute: '/variable-revalidate/cookie.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/cookie',
          },
          '/variable-revalidate/encoding': {
            dataRoute: '/variable-revalidate/encoding.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/encoding',
          },
          '/variable-revalidate/post-method': {
            dataRoute: '/variable-revalidate/post-method.rsc',
            initialRevalidateSeconds: 10,
            srcRoute: '/variable-revalidate/post-method',
          },
          '/variable-revalidate/revalidate-3': {
            dataRoute: '/variable-revalidate/revalidate-3.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/revalidate-3',
          },
          '/variable-revalidate/revalidate-360-isr': {
            dataRoute: '/variable-revalidate/revalidate-360-isr.rsc',
            initialRevalidateSeconds: 10,
            srcRoute: '/variable-revalidate/revalidate-360-isr',
          },
        })
        expect(curManifest.dynamicRoutes).toEqual({
          '/blog/[author]/[slug]': {
            routeRegex: normalizeRegEx('^/blog/([^/]+?)/([^/]+?)(?:/)?$'),
            dataRoute: '/blog/[author]/[slug].rsc',
            fallback: null,
            dataRouteRegex: normalizeRegEx('^/blog/([^/]+?)/([^/]+?)\\.rsc$'),
          },
          '/blog/[author]': {
            dataRoute: '/blog/[author].rsc',
            dataRouteRegex: normalizeRegEx('^\\/blog\\/([^\\/]+?)\\.rsc$'),
            fallback: false,
            routeRegex: normalizeRegEx('^\\/blog\\/([^\\/]+?)(?:\\/)?$'),
          },
          '/dynamic-error/[id]': {
            dataRoute: '/dynamic-error/[id].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/dynamic\\-error\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/dynamic\\-error\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/gen-params-dynamic-revalidate/[slug]': {
            dataRoute: '/gen-params-dynamic-revalidate/[slug].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/gen\\-params\\-dynamic\\-revalidate\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/gen\\-params\\-dynamic\\-revalidate\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/hooks/use-pathname/[slug]': {
            dataRoute: '/hooks/use-pathname/[slug].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/hooks\\/use\\-pathname\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/hooks\\/use\\-pathname\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/partial-gen-params-no-additional-lang/[lang]/[slug]': {
            dataRoute:
              '/partial-gen-params-no-additional-lang/[lang]/[slug].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/partial\\-gen\\-params\\-no\\-additional\\-lang\\/([^\\/]+?)\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: false,
            routeRegex: normalizeRegEx(
              '^\\/partial\\-gen\\-params\\-no\\-additional\\-lang\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/partial-gen-params-no-additional-slug/[lang]/[slug]': {
            dataRoute:
              '/partial-gen-params-no-additional-slug/[lang]/[slug].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/partial\\-gen\\-params\\-no\\-additional\\-slug\\/([^\\/]+?)\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: false,
            routeRegex: normalizeRegEx(
              '^\\/partial\\-gen\\-params\\-no\\-additional\\-slug\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/ssg-draft-mode/[[...route]]': {
            dataRoute: '/ssg-draft-mode/[[...route]].rsc',
            dataRouteRegex: '^\\/ssg\\-draft\\-mode(?:\\/(.+?))?\\.rsc$',
            fallback: null,
            routeRegex: '^\\/ssg\\-draft\\-mode(?:\\/(.+?))?(?:\\/)?$',
          },
          '/force-static/[slug]': {
            dataRoute: '/force-static/[slug].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/force\\-static\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/force\\-static\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          '/static-to-dynamic-error-forced/[id]': {
            dataRoute: '/static-to-dynamic-error-forced/[id].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/static\\-to\\-dynamic\\-error\\-forced\\/([^\\/]+?)\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/static\\-to\\-dynamic\\-error\\-forced\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
        })
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
    }

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
        } finally {
          prevHtml = curHtml
          prev$ = cur$
        }
        return 'success'
      }, 'success')
    })

    it('should cache correctly for fetchCache = force-cache', async () => {
      const res = await next.fetch('/force-cache')
      expect(res.status).toBe(200)

      let prevHtml = await res.text()
      let prev$ = cheerio.load(prevHtml)

      await check(async () => {
        const curRes = await next.fetch('/force-cache')
        expect(curRes.status).toBe(200)

        const curHtml = await curRes.text()
        const cur$ = cheerio.load(curHtml)

        expect(cur$('#data-no-cache').text()).toBe(
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
        expect(cur$('#data-auto-cache').text()).toBe(
          prev$('#data-auto-cache').text()
        )

        return 'success'
      }, 'success')
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

    if (isDev) {
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

        if (isDev) {
          await check(() => {
            const matches = stripAnsi(next.cliOutput).match(
              /partial-gen-params fetch ([\d]{1,})/
            )

            if (matches[1]) {
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

        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/revalidate-3'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
        return 'success'
      }, 'success')
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

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
        return 'success'
      }, 'success')
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

        expect(dataBody1).not.toBe(dataBody2)
        expect(dataBody2).not.toBe(dataBody3)
        expect(dataBody3).not.toBe(dataBody4)

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

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
        return 'success'
      }, 'success')
    })

    it('should cache correctly with utf8 encoding', async () => {
      await check(async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/encoding'
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
          '/variable-revalidate/encoding'
        )
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
        const res = await fetchViaHTTP(
          next.url,
          '/variable-revalidate-edge/body'
        )
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

      const content = await browserOnIndexPage
        .elementByCss('#draft-mode')
        .text()

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
          const params = JSON.parse(
            await browser.elementByCss('#params').text()
          )
          return params.author === 'seb' ? 'found' : params
        }, 'found')

        expect(await browser.eval('window.beforeNav')).toBe(1)
        await browser.elementByCss('#author-1-post-1').click()

        await check(async () => {
          const params = JSON.parse(
            await browser.elementByCss('#params').text()
          )
          return params.author === 'tim' && params.slug === 'first-post'
            ? 'found'
            : params
        }, 'found')

        expect(await browser.eval('window.beforeNav')).toBe(1)
        await browser.back()

        await check(async () => {
          const params = JSON.parse(
            await browser.elementByCss('#params').text()
          )
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
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toInclude('"noindex"')
      expect(html).toInclude('This page could not be found.')
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
        it('should bailout to client rendering - without suspense boundary', async () => {
          const browser = await next.browser(
            '/hooks/use-search-params?first=value&second=other&third'
          )

          expect(await browser.elementByCss('#params-first').text()).toBe(
            'value'
          )
          expect(await browser.elementByCss('#params-second').text()).toBe(
            'other'
          )
          expect(await browser.elementByCss('#params-third').text()).toBe('')
          expect(await browser.elementByCss('#params-not-real').text()).toBe(
            'N/A'
          )
        })

        it('should bailout to client rendering - with suspense boundary', async () => {
          const browser = await next.browser(
            '/hooks/use-search-params/with-suspense?first=value&second=other&third'
          )

          expect(await browser.elementByCss('#params-first').text()).toBe(
            'value'
          )
          expect(await browser.elementByCss('#params-second').text()).toBe(
            'other'
          )
          expect(await browser.elementByCss('#params-third').text()).toBe('')
          expect(await browser.elementByCss('#params-not-real').text()).toBe(
            'N/A'
          )
        })

        it.skip('should have empty search params on force-static', async () => {
          const browser = await next.browser(
            '/hooks/use-search-params/force-static?first=value&second=other&third'
          )

          expect(await browser.elementByCss('#params-first').text()).toBe('N/A')
          expect(await browser.elementByCss('#params-second').text()).toBe(
            'N/A'
          )
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
            expect(await browser.elementByCss('#params-second').text()).toBe(
              'b'
            )
            expect(await browser.elementByCss('#params-third').text()).toBe('c')
            expect(await browser.elementByCss('#params-not-real').text()).toBe(
              'N/A'
            )
          })
        }
      })
      // Don't run these tests in dev mode since they won't be statically generated
      if (!isDev) {
        describe('server response', () => {
          it('should bailout to client rendering - without suspense boundary', async () => {
            const res = await next.fetch('/hooks/use-search-params')
            const html = await res.text()
            expect(html).toInclude('<html id="__next_error__">')
          })

          it('should bailout to client rendering - with suspense boundary', async () => {
            const res = await next.fetch(
              '/hooks/use-search-params/with-suspense'
            )
            const html = await res.text()
            expect(html).toInclude('<p>search params suspense</p>')
          })

          it.skip('should have empty search params on force-static', async () => {
            const res = await next.fetch(
              '/hooks/use-search-params/force-static?first=value&second=other&third'
            )
            const html = await res.text()

            // Shouild not bail out to client rendering
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

    // TODO: needs updating as usePathname should not bail
    describe.skip('usePathname', () => {
      if (isDev) {
        it('should bail out to client rendering during SSG', async () => {
          const res = await next.fetch('/hooks/use-pathname/slug')
          const html = await res.text()
          expect(html).toInclude('<html id="__next_error__">')
        })
      }

      it('should have the correct values', async () => {
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
  }
)
