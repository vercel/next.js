import globOrig from 'glob'
import cheerio from 'cheerio'
import { promisify } from 'util'
import path, { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, normalizeRegEx } from 'next-test-utils'

const glob = promisify(globOrig)

describe('app-dir static/dynamic handling', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app-static')),
      dependencies: {
        react: '0.0.0-experimental-cb5084d1c-20220924',
        'react-dom': '0.0.0-experimental-cb5084d1c-20220924',
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
        'ssr-auto/page.js',
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
          initialRevalidateSeconds: false,
          srcRoute: '/blog/[author]',
          dataRoute: '/blog/tim.rsc',
        },
        '/blog/seb': {
          initialRevalidateSeconds: false,
          srcRoute: '/blog/[author]',
          dataRoute: '/blog/seb.rsc',
        },
        '/blog/styfle': {
          initialRevalidateSeconds: false,
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

  it('should ssr dynamically when detected automatically', async () => {
    const initialRes = await fetchViaHTTP(next.url, '/ssr-auto', undefined, {
      redirect: 'manual',
    })
    expect(initialRes.status).toBe(200)

    const initialHtml = await initialRes.text()
    const initial$ = cheerio.load(initialHtml)

    expect(initial$('#page').text()).toBe('/ssr-auto')
    const initialDate = initial$('#date').text()

    expect(initialHtml).toContain('Example Domain')

    const secondRes = await fetchViaHTTP(next.url, '/ssr-auto', undefined, {
      redirect: 'manual',
    })
    expect(secondRes.status).toBe(200)

    const secondHtml = await secondRes.text()
    const second$ = cheerio.load(secondHtml)

    expect(second$('#page').text()).toBe('/ssr-auto')
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
})
