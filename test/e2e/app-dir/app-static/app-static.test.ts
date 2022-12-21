import globOrig from 'glob'
import cheerio from 'cheerio'
import { promisify } from 'util'
import { join } from 'path'
import { createNextDescribe } from 'e2e-utils'
import { check, normalizeRegEx, waitFor } from 'next-test-utils'

const glob = promisify(globOrig)

createNextDescribe(
  'app-dir static/dynamic handling',
  {
    files: __dirname,
  },
  ({ next, isNextDev: isDev, isNextStart }) => {
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
          'dynamic-error.html',
          'dynamic-error.rsc',
          'dynamic-error/page.js',
          'dynamic-no-gen-params-ssr/[slug]/page.js',
          'dynamic-no-gen-params/[slug]/page.js',
          'force-static/[slug]/page.js',
          'force-static/first.html',
          'force-static/first.rsc',
          'force-static/page.js',
          'force-static/second.html',
          'force-static/second.rsc',
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
          'variable-revalidate/no-store/page.js',
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

        expect(manifest.version).toBe(3)
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
          '/dynamic-error': {
            dataRoute: '/dynamic-error.rsc',
            initialRevalidateSeconds: false,
            srcRoute: '/dynamic-error',
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
          '/hooks/use-pathname/[slug]': {
            dataRoute: '/hooks/use-pathname/[slug].rsc',
            dataRouteRegex: '^\\/hooks\\/use\\-pathname\\/([^\\/]+?)\\.rsc$',
            fallback: null,
            routeRegex: '^\\/hooks\\/use\\-pathname\\/([^\\/]+?)(?:\\/)?$',
          },
          '/force-static/[slug]': {
            dataRoute: '/force-static/[slug].rsc',
            dataRouteRegex: '^\\/force\\-static\\/([^\\/]+?)\\.rsc$',
            fallback: null,
            routeRegex: '^\\/force\\-static\\/([^\\/]+?)(?:\\/)?$',
          },
          '/ssg-preview/[[...route]]': {
            dataRoute: '/ssg-preview/[[...route]].rsc',
            dataRouteRegex: '^\\/ssg\\-preview(?:\\/(.+?))?\\.rsc$',
            fallback: null,
            routeRegex: '^\\/ssg\\-preview(?:\\/(.+?))?(?:\\/)?$',
          },
        })
      })
    }

    it('Should not throw Dynamic Server Usage error when using generateStaticParams with previewData', async () => {
      const browserOnIndexPage = await next.browser('/ssg-preview')

      const content = await browserOnIndexPage
        .elementByCss('#preview-data')
        .text()

      expect(content).toContain('previewData')
    })

    it('should force SSR correctly for headers usage', async () => {
      const res = await next.fetch('/force-static', undefined, {
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

    it('should handle dynamicParams: false correctly', async () => {
      const validParams = ['tim', 'seb', 'styfle']

      for (const param of validParams) {
        const res = await next.fetch(`/blog/${param}`, undefined, {
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
        const invalidRes = await next.fetch(`/blog/${param}`, undefined, {
          redirect: 'manual',
        })
        expect(invalidRes.status).toBe(404)
        expect(await invalidRes.text()).toContain('page could not be found')
      }
    })

    it('should work with forced dynamic path', async () => {
      for (const slug of ['first', 'second']) {
        const res = await next.fetch(
          `/dynamic-no-gen-params-ssr/${slug}`,
          undefined,
          { redirect: 'manual' }
        )
        expect(res.status).toBe(200)
        expect(await res.text()).toContain(`${slug}`)
      }
    })

    it('should work with dynamic path no generateStaticParams', async () => {
      for (const slug of ['first', 'second']) {
        const res = await next.fetch(
          `/dynamic-no-gen-params/${slug}`,
          undefined,
          { redirect: 'manual' }
        )
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
        const res = await next.fetch(
          `/blog/${params.author}/${params.slug}`,
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(200)
        const html = await res.text()
        const $ = cheerio.load(html)

        expect(JSON.parse($('#params').text())).toEqual(params)
        expect($('#page').text()).toBe('/blog/[author]/[slug]')
      }
    })

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

    it('should ssr dynamically when detected automatically with fetch cache option', async () => {
      const pathname = '/ssr-auto/cache-no-store'
      const initialRes = await next.fetch(pathname, undefined, {
        redirect: 'manual',
      })
      expect(initialRes.status).toBe(200)

      const initialHtml = await initialRes.text()
      const initial$ = cheerio.load(initialHtml)

      expect(initial$('#page').text()).toBe(pathname)
      const initialDate = initial$('#date').text()

      expect(initialHtml).toContain('Example Domain')

      const secondRes = await next.fetch(pathname, undefined, {
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
      const res = await next.fetch(`/blog/shu/hi`, undefined, {
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
      const initialRes = await next.fetch(pathname, undefined, {
        redirect: 'manual',
      })
      expect(initialRes.status).toBe(200)

      const initialHtml = await initialRes.text()
      const initial$ = cheerio.load(initialHtml)

      expect(initial$('#page').text()).toBe(pathname)
      const initialDate = initial$('#date').text()

      expect(initialHtml).toContain('Example Domain')

      const secondRes = await next.fetch(pathname, undefined, {
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
      const initialRes = await next.fetch('/ssr-forced', undefined, {
        redirect: 'manual',
      })
      expect(initialRes.status).toBe(200)

      const initialHtml = await initialRes.text()
      const initial$ = cheerio.load(initialHtml)

      expect(initial$('#page').text()).toBe('/ssr-forced')
      const initialDate = initial$('#date').text()

      const secondRes = await next.fetch('/ssr-forced', undefined, {
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
  }
)
