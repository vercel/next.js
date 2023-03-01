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
      ...(process.env.CUSTOM_CACHE_HANDLER
        ? {
            CUSTOM_CACHE_HANDLER: process.env.CUSTOM_CACHE_HANDLER,
          }
        : {}),
    },
  },
  ({ next, isNextDev: isDev, isNextStart, isNextDeploy }) => {
    if (isNextStart) {
      it('should output HTML/RSC files for static paths', async () => {
        const files = (
          await glob('**/*', {
            cwd: join(next.testDir, '.next/server/app'),
          })
        ).filter((file) => file.match(/.*\.(js|html|rsc)$/))

        expect(files).toEqual([
          '(new)/custom/page.js',
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
          'dynamic-error/[id]/page.js',
          'dynamic-no-gen-params-ssr/[slug]/page.js',
          'dynamic-no-gen-params/[slug]/page.js',
          'force-dynamic-no-prerender/[id]/page.js',
          'force-static/[slug]/page.js',
          'force-static/first.html',
          'force-static/first.rsc',
          'force-static/page.js',
          'force-static/second.html',
          'force-static/second.rsc',
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
          'ssg-preview.html',
          'ssg-preview.rsc',
          'ssg-preview/[[...route]]/page.js',
          'ssg-preview/test-2.html',
          'ssg-preview/test-2.rsc',
          'ssg-preview/test.html',
          'ssg-preview/test.rsc',
          'ssr-auto/cache-no-store/page.js',
          'ssr-auto/fetch-revalidate-zero/page.js',
          'ssr-forced/page.js',
          'static-to-dynamic-error-forced/[id]/page.js',
          'static-to-dynamic-error/[id]/page.js',
          'variable-revalidate-edge/encoding/page.js',
          'variable-revalidate-edge/no-store/page.js',
          'variable-revalidate-edge/post-method-cached/page.js',
          'variable-revalidate-edge/post-method-request/page.js',
          'variable-revalidate-edge/revalidate-3/page.js',
          'variable-revalidate/authorization-cached.html',
          'variable-revalidate/authorization-cached.rsc',
          'variable-revalidate/authorization-cached/page.js',
          'variable-revalidate/authorization/page.js',
          'variable-revalidate/cookie-cached.html',
          'variable-revalidate/cookie-cached.rsc',
          'variable-revalidate/cookie-cached/page.js',
          'variable-revalidate/cookie/page.js',
          'variable-revalidate/encoding.html',
          'variable-revalidate/encoding.rsc',
          'variable-revalidate/encoding/page.js',
          'variable-revalidate/no-store/page.js',
          'variable-revalidate/post-method-cached/page.js',
          'variable-revalidate/post-method/page.js',
          'variable-revalidate/revalidate-3.html',
          'variable-revalidate/revalidate-3.rsc',
          'variable-revalidate/revalidate-3/page.js',
        ])
      })

      it('should have correct prerender-manifest entries', async () => {
        const manifest = JSON.parse(
          await next.readFile('.next/prerender-manifest.json')
        )

        Object.keys(manifest.dynamicRoutes).forEach((key) => {
          const item = manifest.dynamicRoutes[key]

          if (item.dataRouteRegex) {
            item.dataRouteRegex = normalizeRegEx(item.dataRouteRegex)
          }
          if (item.routeRegex) {
            item.routeRegex = normalizeRegEx(item.routeRegex)
          }
        })

        expect(manifest.version).toBe(4)
        expect(manifest.routes).toEqual({
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
          '/ssg-preview': {
            dataRoute: '/ssg-preview.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-preview/[[...route]]',
          },
          '/ssg-preview/test': {
            dataRoute: '/ssg-preview/test.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-preview/[[...route]]',
          },
          '/ssg-preview/test-2': {
            dataRoute: '/ssg-preview/test-2.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/ssg-preview/[[...route]]',
          },
          '/variable-revalidate/authorization-cached': {
            dataRoute: '/variable-revalidate/authorization-cached.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/authorization-cached',
          },
          '/variable-revalidate/cookie-cached': {
            dataRoute: '/variable-revalidate/cookie-cached.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/cookie-cached',
          },
          '/variable-revalidate/encoding': {
            dataRoute: '/variable-revalidate/encoding.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/encoding',
          },
          '/variable-revalidate/revalidate-3': {
            dataRoute: '/variable-revalidate/revalidate-3.rsc',
            initialRevalidateSeconds: 3,
            srcRoute: '/variable-revalidate/revalidate-3',
          },
        })
        expect(manifest.dynamicRoutes).toEqual({
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
            dataRouteRegex: '^\\/dynamic\\-error\\/([^\\/]+?)\\.rsc$',
            fallback: null,
            routeRegex: '^\\/dynamic\\-error\\/([^\\/]+?)(?:\\/)?$',
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
          '/ssg-preview/[[...route]]': {
            dataRoute: '/ssg-preview/[[...route]].rsc',
            dataRouteRegex: normalizeRegEx(
              '^\\/ssg\\-preview(?:\\/(.+?))?\\.rsc$'
            ),
            fallback: null,
            routeRegex: normalizeRegEx(
              '^\\/ssg\\-preview(?:\\/(.+?))?(?:\\/)?$'
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

    it('should not cache correctly with authorization header', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/authorization'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const pageData = $('#page-data').text()

      for (let i = 0; i < 3; i++) {
        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/authorization'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#page-data').text()).not.toBe(pageData)
      }
    })

    it('should cache correctly with authorization header and revalidate', async () => {
      await check(async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/authorization-cached'
        )
        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        const layoutData = $('#layout-data').text()
        const pageData = $('#page-data').text()

        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/authorization-cached'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
        return 'success'
      }, 'success')
    })

    it('should not cache correctly with POST method', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate/post-method'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const pageData = $('#page-data').text()

      for (let i = 0; i < 3; i++) {
        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/post-method'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#page-data').text()).not.toBe(pageData)
      }
    })

    it('should not cache correctly with POST method request init', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/variable-revalidate-edge/post-method-request'
      )
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const pageData = $('#page-data').text()

      for (let i = 0; i < 3; i++) {
        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate-edge/post-method-request'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#page-data').text()).not.toBe(pageData)
      }
    })

    it('should cache correctly with post method and revalidate', async () => {
      await check(async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/post-method-cached'
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
          '/variable-revalidate/post-method-cached'
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
          '/variable-revalidate-edge/post-method-cached'
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
          '/variable-revalidate-edge/post-method-cached'
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
          '/variable-revalidate/post-method-cached'
        )
        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        const layoutData = $('#layout-data').text()
        const pageData = $('#page-data').text()

        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/post-method-cached'
        )
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#layout-data').text()).toBe(layoutData)
        expect($2('#page-data').text()).toBe(pageData)
        return 'success'
      }, 'success')
    })

    it('should not cache correctly with cookie header', async () => {
      const res = await fetchViaHTTP(next.url, '/variable-revalidate/cookie')
      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      const pageData = $('#page-data').text()

      for (let i = 0; i < 3; i++) {
        const res2 = await fetchViaHTTP(next.url, '/variable-revalidate/cookie')
        expect(res2.status).toBe(200)
        const html2 = await res2.text()
        const $2 = cheerio.load(html2)

        expect($2('#page-data').text()).not.toBe(pageData)
      }
    })

    it('should cache correctly with cookie header and revalidate', async () => {
      await check(async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/cookie-cached'
        )
        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        const layoutData = $('#layout-data').text()
        const pageData = $('#page-data').text()

        const res2 = await fetchViaHTTP(
          next.url,
          '/variable-revalidate/cookie-cached'
        )
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

    it('Should not throw Dynamic Server Usage error when using generateStaticParams with previewData', async () => {
      const browserOnIndexPage = await next.browser('/ssg-preview')

      const content = await browserOnIndexPage
        .elementByCss('#preview-data')
        .text()

      expect(content).toContain('previewData')
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

    if (!(global as any).isNextDeploy) {
      it('should show a message to leave feedback for `appDir`', async () => {
        expect(next.cliOutput).toContain(
          `Thank you for testing \`appDir\` please leave your feedback at https://nextjs.link/app-feedback`
        )
      })
    }

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
