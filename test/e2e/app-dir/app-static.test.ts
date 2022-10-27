import globOrig from 'glob'
import cheerio from 'cheerio'
import { promisify } from 'util'
import path, { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP, normalizeRegEx } from 'next-test-utils'
import webdriver from 'next-webdriver'

const glob = promisify(globOrig)

describe('app-dir static/dynamic handling', () => {
  const isDev = (global as any).isNextDev

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app-static')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  if ((global as any).isNextStart) {
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
        'dynamic-no-gen-params-ssr/[slug]/page.js',
        'dynamic-no-gen-params/[slug]/page.js',
        'hooks/use-pathname/[slug]/page.js',
        'hooks/use-search-params/[slug]/page.js',
        'ssr-auto/cache-no-store/page.js',
        'ssr-auto/fetch-revalidate-zero/page.js',
        'ssr-forced/page.js',
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
      })
    })
  }

  it('should handle dynamicParams: false correctly', async () => {
    const validParams = ['tim', 'seb', 'styfle']

    for (const param of validParams) {
      const res = await fetchViaHTTP(next.url, `/blog/${param}`, undefined, {
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
      const invalidRes = await fetchViaHTTP(
        next.url,
        `/blog/${param}`,
        undefined,
        { redirect: 'manual' }
      )
      expect(invalidRes.status).toBe(404)
      expect(await invalidRes.text()).toContain('page could not be found')
    }
  })

  it('should work with forced dynamic path', async () => {
    for (const slug of ['first', 'second']) {
      const res = await fetchViaHTTP(
        next.url,
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
      const res = await fetchViaHTTP(
        next.url,
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
      const res = await fetchViaHTTP(
        next.url,
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
    const browser = await webdriver(next.url, '/blog/tim')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      '/blog/[author]'
    )
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
    const initialRes = await fetchViaHTTP(next.url, pathname, undefined, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe(pathname)
    const initialDate = initial$('#date').text()

    expect(initialHtml).toContain('Example Domain')

    const secondRes = await fetchViaHTTP(next.url, pathname, undefined, {
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
    const res = await fetchViaHTTP(next.url, `/blog/shu/hi`, undefined, {
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
    const initialRes = await fetchViaHTTP(next.url, pathname, undefined, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe(pathname)
    const initialDate = initial$('#date').text()

    expect(initialHtml).toContain('Example Domain')

    const secondRes = await fetchViaHTTP(next.url, pathname, undefined, {
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
    const initialRes = await fetchViaHTTP(next.url, '/ssr-forced', undefined, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe('/ssr-forced')
    const initialDate = initial$('#date').text()

    const secondRes = await fetchViaHTTP(next.url, '/ssr-forced', undefined, {
      redirect: 'manual',
    })
    expect(secondRes.status).toBe(200)

    const secondHtml = await secondRes.text()
    const second$ = cheerio.load(secondHtml)

    expect(second$('#page').text()).toBe('/ssr-forced')
    const secondDate = second$('#date').text()

    expect(secondDate).not.toBe(initialDate)
  })

  describe('hooks', () => {
    describe('useSearchParams', () => {
      if (isDev) {
        it('should bail out to client rendering during SSG', async () => {
          const res = await fetchViaHTTP(
            next.url,
            '/hooks/use-search-params/slug'
          )
          const html = await res.text()
          expect(html).toInclude('<html id="__next_error__">')
        })
      }

      it('should have the correct values', async () => {
        const browser = await webdriver(
          next.url,
          '/hooks/use-search-params/slug?first=value&second=other&third'
        )

        expect(await browser.elementByCss('#params-first').text()).toBe('value')
        expect(await browser.elementByCss('#params-second').text()).toBe(
          'other'
        )
        expect(await browser.elementByCss('#params-third').text()).toBe('')
        expect(await browser.elementByCss('#params-not-real').text()).toBe(
          'N/A'
        )
      })

      // TODO-APP: re-enable after investigating rewrite params
      if (!(global as any).isNextDeploy) {
        it('should have values from canonical url on rewrite', async () => {
          const browser = await webdriver(
            next.url,
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

    describe('usePathname', () => {
      if (isDev) {
        it('should bail out to client rendering during SSG', async () => {
          const res = await fetchViaHTTP(next.url, '/hooks/use-pathname/slug')
          const html = await res.text()
          expect(html).toInclude('<html id="__next_error__">')
        })
      }

      it('should have the correct values', async () => {
        const browser = await webdriver(next.url, '/hooks/use-pathname/slug')

        expect(await browser.elementByCss('#pathname').text()).toBe(
          '/hooks/use-pathname/slug'
        )
      })

      it('should have values from canonical url on rewrite', async () => {
        const browser = await webdriver(next.url, '/rewritten-use-pathname')

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
  })
})
