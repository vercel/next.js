import fs from 'fs-extra'
import cookie from 'cookie'
import cheerio from 'cheerio'
import { join, sep } from 'path'
import escapeRegex from 'escape-string-regexp'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import {
  assertHasRedbox,
  check,
  fetchViaHTTP,
  getBrowserBodyText,
  getRedboxHeader,
  normalizeRegEx,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import stripAnsi from 'strip-ansi'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('Prerender', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'prerender/pages')),
        'world.txt': new FileRef(join(__dirname, 'prerender/world.txt')),
      },
      dependencies: {
        firebase: '7.14.5',
      },
      nextConfig: {
        async rewrites() {
          return [
            {
              source: '/some-rewrite/:item',
              destination: '/blog/post-:item',
            },
            {
              source: '/about',
              destination: '/lang/en/about',
            },
            {
              source: '/blocked-create',
              destination: '/blocking-fallback/blocked-create',
            },
          ]
        },
      },
      patchFileDelay: 500,
    })
  })
  afterAll(() => next.destroy())

  async function waitForCacheWrite(
    prerenderPath = '',
    timeBeforeRevalidateMilliseconds,
    retries = 30
  ) {
    for (let i = 0; i < retries; i++) {
      const lastRetry = i === retries - 1
      const jsonPath = join(
        next.testDir,
        '.next',
        'server',
        'pages',
        `${prerenderPath}.html`
      )
      try {
        const jsonStats = await fs.stat(jsonPath)
        const jsonLastModified = jsonStats.mtime.getTime()

        if (timeBeforeRevalidateMilliseconds <= jsonLastModified) {
          break
        }
        throw new Error(
          `revalidate cache not past ${timeBeforeRevalidateMilliseconds} received time ${jsonLastModified}`
        )
      } catch (err) {
        if (lastRetry) {
          throw err
        }
      }
      await waitFor(500)
    }
  }

  function isCachingHeader(cacheControl) {
    return !cacheControl || !/no-store/.test(cacheControl)
  }

  const allowHeader = [
    'host',
    'x-matched-path',
    'x-prerender-revalidate',
    'x-prerender-revalidate-if-generated',
    'x-next-revalidated-tags',
    'x-next-revalidate-tag-token',
  ]

  const expectedManifestRoutes = () => ({
    '/': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/index.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 2,
      srcRoute: null,
    },
    '/blog/[post3]': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/[post3].json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: '/blog/[post]',
    },
    '/blog/post-1': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post-1.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: '/blog/[post]',
    },
    '/blog/post-2': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post-2.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: '/blog/[post]',
    },
    '/blog/post-4': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post-4.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: '/blog/[post]',
    },
    '/blog/post-1/comment-1': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post-1/comment-1.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 2,
      srcRoute: '/blog/[post]/[comment]',
    },
    '/blog/post-2/comment-2': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post-2/comment-2.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 2,
      srcRoute: '/blog/[post]/[comment]',
    },
    '/blog/post.1': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog/post.1.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: '/blog/[post]',
    },
    '/catchall-explicit/another/value': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/another/value.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-explicit/first': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/first.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-explicit/hello/another': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/hello/another.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-explicit/second': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/second.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-explicit/[first]/[second]': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/[first]/[second].json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-explicit/[third]/[fourth]': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-explicit/[third]/[fourth].json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall-explicit/[...slug]',
    },
    '/catchall-optional': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-optional.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/catchall-optional/[[...slug]]',
    },
    '/catchall-optional/value': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall-optional/value.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/catchall-optional/[[...slug]]',
    },
    '/large-page-data': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/large-page-data.json`,
      initialRevalidateSeconds: false,
      srcRoute: null,
    },
    '/another': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/another.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: null,
    },
    '/preview': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/preview.json`,
      initialRevalidateSeconds: false,
      srcRoute: null,
    },
    '/api-docs/first': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/api-docs/first.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/api-docs/[...slug]',
    },
    '/blocking-fallback-once/404-on-manual-revalidate': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blocking-fallback-once/404-on-manual-revalidate.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/blocking-fallback-once/[slug]',
    },
    '/blocking-fallback-some/a': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blocking-fallback-some/a.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/blocking-fallback-some/[slug]',
    },
    '/blocking-fallback-some/b': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blocking-fallback-some/b.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/blocking-fallback-some/[slug]',
    },
    '/blocking-fallback/lots-of-data': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blocking-fallback/lots-of-data.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/blocking-fallback/[slug]',
    },
    '/blocking-fallback/test-errors-1': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blocking-fallback/test-errors-1.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/blocking-fallback/[slug]',
    },
    '/blog': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/blog.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 10,
      srcRoute: null,
    },
    '/default-revalidate': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/default-revalidate.json`,
      initialRevalidateSeconds: false,
      srcRoute: null,
    },
    '/dynamic/[first]': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/dynamic/[first].json`,
      initialRevalidateSeconds: false,
      srcRoute: '/dynamic/[slug]',
    },
    '/dynamic/[second]': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/dynamic/[second].json`,
      initialRevalidateSeconds: false,
      srcRoute: '/dynamic/[slug]',
    },
    // TODO: investigate index/index
    // '/index': {
    //   dataRoute: `/_next/data/${next.buildId}/index/index.json`,
    //   initialRevalidateSeconds: false,
    //   srcRoute: null,
    // },
    '/fallback-true/first': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/fallback-true/first.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 2,
      srcRoute: '/fallback-true/[slug]',
    },
    '/lang/de/about': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/lang/de/about.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/lang/[lang]/about',
    },
    '/lang/en/about': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/lang/en/about.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/lang/[lang]/about',
    },
    '/lang/es/about': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/lang/es/about.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/lang/[lang]/about',
    },
    '/lang/fr/about': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/lang/fr/about.json`,
      initialRevalidateSeconds: false,
      srcRoute: '/lang/[lang]/about',
    },
    '/something': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/something.json`,
      initialRevalidateSeconds: false,
      srcRoute: null,
    },
    '/catchall/another/value': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall/another/value.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall/[...slug]',
    },
    '/catchall/first': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall/first.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall/[...slug]',
    },
    '/catchall/second': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall/second.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall/[...slug]',
    },
    '/catchall/hello/another': {
      allowHeader,
      dataRoute: `/_next/data/${next.buildId}/catchall/hello/another.json`,
      initialExpireSeconds: 31536000,
      initialRevalidateSeconds: 1,
      srcRoute: '/catchall/[...slug]',
    },
  })

  const navigateTest = (isDev = false) => {
    it('should navigate between pages successfully', async () => {
      const toBuild = [
        '/',
        '/another',
        '/something',
        '/normal',
        '/blog/post-1',
        '/blog/post-1/comment-1',
        '/catchall/first',
      ]

      await waitFor(2500)

      await Promise.all(toBuild.map((pg) => renderViaHTTP(next.url, pg)))

      const browser = await webdriver(next.url, '/')
      let text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)

      // go to /another
      async function goFromHomeToAnother() {
        await browser.eval('window.beforeAnother = true')
        await browser.elementByCss('#another').click()
        await browser.waitForElementByCss('#home')
        text = await browser.elementByCss('p').text()
        expect(await browser.eval('window.beforeAnother')).toBe(true)
        expect(text).toMatch(/hello.*?world/)
      }
      await goFromHomeToAnother()

      // go to /
      async function goFromAnotherToHome() {
        await browser.eval('window.didTransition = 1')
        await browser.elementByCss('#home').click()
        await browser.waitForElementByCss('#another')
        text = await browser.elementByCss('p').text()
        expect(text).toMatch(/hello.*?world/)
        expect(await browser.eval('window.didTransition')).toBe(1)
      }
      await goFromAnotherToHome()

      // Client-side SSG data caching test
      {
        // Let revalidation period lapse
        await waitFor(2000)

        // Trigger revalidation (visit page)
        await goFromHomeToAnother()
        const snapTime = await browser.elementByCss('#anotherTime').text()

        // Wait for revalidation to finish
        await waitFor(2000)

        // Re-visit page
        await goFromAnotherToHome()
        await goFromHomeToAnother()

        const nextTime = await browser.elementByCss('#anotherTime').text()
        // in dev the time should always differ as we don't cache
        // in production the time may differ or may not depending
        // on if fresh content beat the stale content
        if (isDev) {
          expect(snapTime).not.toMatch(nextTime)
        }
        // Reset to Home for next test
        await goFromAnotherToHome()
      }

      // go to /something
      await browser.elementByCss('#something').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#post-1')

      // go to /blog/post-1
      await browser.elementByCss('#post-1').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/Post:.*?post-1/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // TODO: investigate index/index
      // go to /index
      // await browser.elementByCss('#to-nested-index').click()
      // await browser.waitForElementByCss('#home')
      // text = await browser.elementByCss('p').text()
      // expect(text).toMatch(/hello nested index/)

      // go to /
      // await browser.elementByCss('#home').click()
      // await browser.waitForElementByCss('#comment-1')

      // go to /catchall-optional
      await browser.elementByCss('#catchall-optional-root').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/Catch all: \[\]/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /dynamic/[first]
      await browser.elementByCss('#dynamic-first').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('#param').text()
      expect(text).toMatch(/Hi \[first\]!/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /dynamic/[second]
      await browser.elementByCss('#dynamic-second').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('#param').text()
      expect(text).toMatch(/Hi \[second\]!/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /catchall-explicit/[first]/[second]
      await browser.elementByCss('#catchall-explicit-string').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('#catchall').text()
      expect(text).toMatch(/Hi \[first\] \[second\]/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /catchall-explicit/[first]/[second]
      await browser.elementByCss('#catchall-explicit-object').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('#catchall').text()
      expect(text).toMatch(/Hi \[third\] \[fourth\]/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /catchall-optional/value
      await browser.elementByCss('#catchall-optional-value').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p').text()
      expect(text).toMatch(/Catch all: \[value\]/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#comment-1')

      // go to /blog/post-1/comment-1
      await browser.elementByCss('#comment-1').click()
      await browser.waitForElementByCss('#home')
      text = await browser.elementByCss('p:nth-child(2)').text()
      expect(text).toMatch(/Comment:.*?comment-1/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      // go to /catchall/first
      await browser.elementByCss('#home').click()
      await browser.waitForElementByCss('#to-catchall')
      await browser.elementByCss('#to-catchall').click()
      await browser.waitForElementByCss('#catchall')
      text = await browser.elementByCss('#catchall').text()
      expect(text).toMatch(/Hi.*?first/)
      expect(await browser.eval('window.didTransition')).toBe(1)

      await browser.close()
    })
  }

  const runTests = (isDev: boolean = false, isDeploy: boolean) => {
    navigateTest(isDev)

    it('should respond with 405 for POST to static page', async () => {
      const res = await fetchViaHTTP(next.url, '/', undefined, {
        method: 'POST',
      })
      expect(res.status).toBe(405)

      if (!isDeploy) {
        expect(await res.text()).toContain('Method Not Allowed')
      }
    })

    it('should SSR normal page correctly', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toMatch(/hello.*?world/)
    })

    it('should SSR incremental page correctly', async () => {
      const html = await renderViaHTTP(next.url, '/blog/post-1')

      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)
      expect(html).toMatch(/Post:.*?post-1/)
    })

    it('should SSR blocking path correctly (blocking)', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/blocking-fallback/random-path'
      )
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)
      expect($('p').text()).toBe('Post: random-path')
    })

    it('should SSR blocking path correctly (pre-rendered)', async () => {
      const html = await renderViaHTTP(next.url, '/blocking-fallback-some/a')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)
      expect($('p').text()).toBe('Post: a')
    })

    it('should have gsp in __NEXT_DATA__', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).gsp).toBe(true)
    })

    it('should not have gsp in __NEXT_DATA__ for non-GSP page', async () => {
      const html = await renderViaHTTP(next.url, '/normal')
      const $ = cheerio.load(html)
      expect('gsp' in JSON.parse($('#__NEXT_DATA__').text())).toBe(false)
    })

    it('should not supply query values to params or useRouter non-dynamic page SSR', async () => {
      const html = await renderViaHTTP(next.url, '/something?hello=world')
      const $ = cheerio.load(html)
      const query = $('#query').text()
      expect(JSON.parse(query)).toEqual({})
      const params = $('#params').text()
      expect(JSON.parse(params)).toEqual({})
    })

    it('should not supply query values to params in /_next/data request', async () => {
      const data = JSON.parse(
        await renderViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/something.json?hello=world`
        )
      )
      expect(data.pageProps.params).toEqual({})
    })

    it('should not supply query values to params or useRouter dynamic page SSR', async () => {
      const html = await renderViaHTTP(next.url, '/blog/post-1?hello=world')
      const $ = cheerio.load(html)

      const params = $('#params').text()
      expect(JSON.parse(params)).toEqual({ post: 'post-1' })

      const query = $('#query').text()
      expect(JSON.parse(query)).toEqual({ post: 'post-1' })
    })

    it('should return data correctly', async () => {
      const data = JSON.parse(
        await renderViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/something.json`
        )
      )
      expect(data.pageProps.world).toBe('world')
    })

    it('should return data correctly for dynamic page', async () => {
      const data = JSON.parse(
        await renderViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/post-1.json`
        )
      )
      expect(data.pageProps.post).toBe('post-1')
    })

    it('should return data correctly for dynamic page (non-seeded)', async () => {
      const data = JSON.parse(
        await renderViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/post-3.json`
        )
      )
      expect(data.pageProps.post).toBe('post-3')
    })

    if (!isDev) {
      it('should use correct caching headers for a revalidate page', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/')
        expect(initialRes.headers.get('cache-control')).toBe(
          isDeploy
            ? 'public, max-age=0, must-revalidate'
            : 's-maxage=2, stale-while-revalidate=31535998'
        )
      })

      it('should use correct caching headers for a fallback-true page (prerendered)', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/fallback-true/first')
        expect(initialRes.status).toBe(200)
        expect(initialRes.headers.get('cache-control')).toBe(
          isDeploy
            ? 'public, max-age=0, must-revalidate'
            : 's-maxage=2, stale-while-revalidate=31535998'
        )
        expect(await initialRes.text()).not.toContain('hi fallback')

        const dataRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/fallback-true/first.json`
        )
        expect(dataRes.status).toBe(200)
        expect(dataRes.headers.get('cache-control')).toBe(
          isDeploy
            ? 'public, max-age=0, must-revalidate'
            : 's-maxage=2, stale-while-revalidate=31535998'
        )

        await retry(async () => {
          const finalRes = await fetchViaHTTP(next.url, `/fallback-true/first`)
          expect(finalRes.status).toBe(200)
          expect(finalRes.headers.get('cache-control')).toBe(
            isDeploy
              ? 'public, max-age=0, must-revalidate'
              : 's-maxage=2, stale-while-revalidate=31535998'
          )
          expect(await finalRes.text()).not.toContain('hi fallback')
        })
      })

      it('should use correct caching headers for a fallback-true page (lazy)', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/fallback-true/second')
        expect(initialRes.status).toBe(200)
        expect(initialRes.headers.get('cache-control')).toBe(
          isDeploy
            ? 'public, max-age=0, must-revalidate'
            : 'private, no-cache, no-store, max-age=0, must-revalidate'
        )
        expect(await initialRes.text()).toContain('hi fallback')

        const dataRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/fallback-true/second.json`
        )
        expect(dataRes.status).toBe(200)
        expect(dataRes.headers.get('cache-control')).toBe(
          isDeploy
            ? 'public, max-age=0, must-revalidate'
            : 's-maxage=2, stale-while-revalidate=31535998'
        )

        await retry(async () => {
          const finalRes = await fetchViaHTTP(next.url, `/fallback-true/second`)
          expect(finalRes.status).toBe(200)
          expect(finalRes.headers.get('cache-control')).toBe(
            isDeploy
              ? 'public, max-age=0, must-revalidate'
              : 's-maxage=2, stale-while-revalidate=31535998'
          )
          expect(await finalRes.text()).not.toContain('hi fallback')
        })
      })
    }

    it('should navigate to a normal page and back', async () => {
      const browser = await webdriver(next.url, '/')
      let text = await browser.elementByCss('p').text()
      expect(text).toMatch(/hello.*?world/)

      await browser.elementByCss('#normal').click()
      await browser.waitForElementByCss('#normal-text')
      text = await browser.elementByCss('#normal-text').text()
      expect(text).toMatch(/a normal page/)
    })

    it('should parse query values on mount correctly', async () => {
      const browser = await webdriver(next.url, '/blog/post-1?another=value')
      const text = await browser.elementByCss('#query').text()
      expect(text).toMatch(/another.*?value/)
      expect(text).toMatch(/post.*?post-1/)
    })

    it('should reload page on failed data request', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.beforeClick = "abc"')
      await browser.elementByCss('#broken-post').click()
      expect(
        await check(() => browser.eval('window.beforeClick'), {
          test(v) {
            return v !== 'abc'
          },
        })
      ).toBe(true)
    })

    it('should SSR dynamic page with brackets in param as object', async () => {
      const html = await renderViaHTTP(next.url, '/dynamic/[first]')
      const $ = cheerio.load(html)
      expect($('#param').text()).toMatch(/Hi \[first\]!/)
    })

    it('should navigate to dynamic page with brackets in param as object', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#dynamic-first').click()
      await browser.waitForElementByCss('#param')
      const value = await browser.elementByCss('#param').text()
      expect(value).toMatch(/Hi \[first\]!/)
    })

    it('should SSR dynamic page with brackets in param as string', async () => {
      const html = await renderViaHTTP(next.url, '/dynamic/[second]')
      const $ = cheerio.load(html)
      expect($('#param').text()).toMatch(/Hi \[second\]!/)
    })

    it('should navigate to dynamic page with brackets in param as string', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#dynamic-second').click()
      await browser.waitForElementByCss('#param')
      const value = await browser.elementByCss('#param').text()
      expect(value).toMatch(/Hi \[second\]!/)
    })

    it('should not return data for fallback: false and missing dynamic page', async () => {
      const res1 = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/dynamic/oopsie.json`
      )
      expect(res1.status).toBe(404)

      await waitFor(500)

      const res2 = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/dynamic/oopsie.json`
      )
      expect(res2.status).toBe(404)

      await waitFor(500)

      const res3 = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/dynamic/oopsie.json`
      )
      expect(res3.status).toBe(404)
    })

    it('should server prerendered path correctly for SSG pages that starts with api-docs', async () => {
      const html = await renderViaHTTP(next.url, '/api-docs/first')
      const $ = cheerio.load(html)

      expect($('#api-docs').text()).toBe('API Docs')
      expect(JSON.parse($('#props').text())).toEqual({
        hello: 'world',
      })
    })

    it('should render correctly for SSG pages that starts with api-docs', async () => {
      const browser = await webdriver(next.url, '/api-docs/second')
      await browser.waitForElementByCss('#api-docs')

      expect(await browser.elementByCss('#api-docs').text()).toBe('API Docs')
      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
        hello: 'world',
      })
    })

    it('should return data correctly for SSG pages that starts with api-docs', async () => {
      const data = await renderViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/api-docs/first.json`
      )
      const { pageProps } = JSON.parse(data)

      expect(pageProps).toEqual({
        hello: 'world',
      })
    })

    it('should SSR catch-all page with brackets in param as string', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/catchall-explicit/[first]/[second]'
      )
      const $ = cheerio.load(html)
      expect($('#catchall').text()).toMatch(/Hi \[first\] \[second\]/)
    })

    it('should navigate to catch-all page with brackets in param as string', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#catchall-explicit-string').click()
      await browser.waitForElementByCss('#catchall')
      const value = await browser.elementByCss('#catchall').text()
      expect(value).toMatch(/Hi \[first\] \[second\]/)
    })

    it('should SSR catch-all page with brackets in param as object', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/catchall-explicit/[third]/[fourth]'
      )
      const $ = cheerio.load(html)
      expect($('#catchall').text()).toMatch(/Hi \[third\] \[fourth\]/)
    })

    it('should navigate to catch-all page with brackets in param as object', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#catchall-explicit-object').click()
      await browser.waitForElementByCss('#catchall')
      const value = await browser.elementByCss('#catchall').text()
      expect(value).toMatch(/Hi \[third\] \[fourth\]/)
    })

    if ((global as any).isNextStart) {
      // TODO: dev currently renders this page as blocking, meaning it shows the
      // server error instead of continuously retrying. Do we want to change this?
      it.skip('should reload page on failed data request, and retry', async () => {
        const browser = await webdriver(next.url, '/')
        await browser.eval('window.beforeClick = "abc"')
        await browser.elementByCss('#broken-at-first-post').click()
        expect(
          await check(() => browser.eval('window.beforeClick'), {
            test(v) {
              return v !== 'abc'
            },
          })
        ).toBe(true)

        const text = await browser.elementByCss('#params').text()
        expect(text).toMatch(/post.*?post-999/)
      })
    }

    it('should support prerendered catchall route', async () => {
      const html = await renderViaHTTP(next.url, '/catchall/another/value')
      const $ = cheerio.load(html)

      expect(
        JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
      ).toBe(false)
      expect($('#catchall').text()).toMatch(/Hi.*?another value/)
    })

    it('should support lazy catchall route', async () => {
      const html = await renderViaHTTP(next.url, '/catchall/notreturnedinpaths')
      const $ = cheerio.load(html)
      expect($('#catchall').text()).toBe('fallback')

      // hydration
      const browser = await webdriver(next.url, '/catchall/delayby3s')

      const text1 = await browser.elementByCss('#catchall').text()
      expect(text1).toBe('fallback')

      await check(
        () => browser.elementByCss('#catchall').text(),
        /Hi.*?delayby3s/
      )
    })

    it('should support nested lazy catchall route', async () => {
      // We will render fallback for a "lazy" route
      const html = await renderViaHTTP(
        next.url,
        '/catchall/notreturnedinpaths/nested'
      )
      const $ = cheerio.load(html)
      expect($('#catchall').text()).toBe('fallback')

      // hydration
      const browser = await webdriver(next.url, '/catchall/delayby3s/nested')

      const text1 = await browser.elementByCss('#catchall').text()
      expect(text1).toBe('fallback')

      await check(
        () => browser.elementByCss('#catchall').text(),
        /Hi.*?delayby3s nested/
      )
    })

    it('should support prerendered catchall-explicit route (nested)', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/catchall-explicit/another/value'
      )
      const $ = cheerio.load(html)

      expect(
        JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
      ).toBe(false)
      expect($('#catchall').text()).toMatch(/Hi.*?another value/)
    })

    it('should support prerendered catchall-explicit route (single)', async () => {
      const html = await renderViaHTTP(next.url, '/catchall-explicit/second')
      const $ = cheerio.load(html)

      expect(
        JSON.parse(cheerio.load(html)('#__NEXT_DATA__').text()).isFallback
      ).toBe(false)
      expect($('#catchall').text()).toMatch(/Hi.*?second/)
    })

    it('should handle fallback only page correctly HTML', async () => {
      const browser = await webdriver(next.url, '/fallback-only/first%2Fpost', {
        waitHydration: false,
      })

      const text = await browser.elementByCss('p').text()
      expect(text).toContain('hi fallback')

      if (isDeploy) {
        // patchFile does not work with deploy tests
        return
      }

      await next.patchFile('resolve-static-props', '', async () => {
        // wait for fallback data to load
        await check(() => browser.elementByCss('p').text(), /Post/)

        // check fallback data
        const post = await browser.elementByCss('p').text()
        const query = JSON.parse(await browser.elementByCss('#query').text())
        const params = JSON.parse(await browser.elementByCss('#params').text())

        expect(post).toContain('first/post')
        expect(params).toEqual({
          slug: 'first/post',
        })
        expect(query).toEqual(params)
      })
    })

    // patchFile does not work with deploy tests
    if (!isDeploy) {
      it('should handle fallback only page correctly data', async () => {
        await next.patchFile('resolve-static-props', '', async () => {
          const data = JSON.parse(
            await renderViaHTTP(
              next.url,
              `/_next/data/${next.buildId}/fallback-only/second%2Fpost.json`
            )
          )

          expect(data.pageProps.params).toEqual({
            slug: 'second/post',
          })
        })
      })
    }

    it('should 404 for a missing catchall explicit route', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/catchall-explicit/notreturnedinpaths'
      )
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toMatch(/This page could not be found/)
    })

    it('should 404 for an invalid data url', async () => {
      const res = await fetchViaHTTP(next.url, `/_next/data/${next.buildId}`)

      // when deployed this will match due to `index.json` matching the
      // directory itself
      if (!isDeploy) {
        expect(res.status).toBe(404)
      }
    })

    it('should allow rewriting to SSG page with fallback: false', async () => {
      const html = await renderViaHTTP(next.url, '/about')
      expect(html).toMatch(/About:.*?en/)
    })

    it("should allow rewriting to SSG page with fallback: 'blocking'", async () => {
      const html = await renderViaHTTP(next.url, '/blocked-create')
      expect(html).toMatch(/Post:.*?blocked-create/)
    })

    it('should fetch /_next/data correctly with mismatched href and as', async () => {
      const browser = await webdriver(next.url, '/')

      if (!isDev) {
        await browser.eval(() =>
          document.querySelector('#to-rewritten-ssg').scrollIntoView()
        )

        await check(async () => {
          const hrefs = await browser.eval(
            `Object.keys(window.next.router.sdc)`
          )
          hrefs.sort()
          expect(
            hrefs.map((href) =>
              new URL(href).pathname.replace(/^\/_next\/data\/[^/]+/, '')
            )
          ).toContainEqual('/lang/en/about.json')
          return 'yes'
        }, 'yes')
      }
      await browser.eval('window.beforeNav = "hi"')
      await browser.elementByCss('#to-rewritten-ssg').click()
      await browser.waitForElementByCss('#about')

      expect(await browser.eval('window.beforeNav')).toBe('hi')
      expect(await browser.elementByCss('#about').text()).toBe('About: en')
    })

    it('should not error when rewriting to fallback dynamic SSG page', async () => {
      const item = Math.round(Math.random() * 100)
      const browser = await webdriver(next.url, `/some-rewrite/${item}`)

      await check(
        () => browser.elementByCss('p').text(),
        new RegExp(`Post: post-${item}`)
      )

      expect(JSON.parse(await browser.elementByCss('#params').text())).toEqual({
        post: `post-${item}`,
      })
      expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
        post: `post-${item}`,
      })
    })

    it('should show warning when large amount of page data is returned', async () => {
      await renderViaHTTP(next.url, '/large-page-data')
      await check(
        () => next.cliOutput,
        /Warning: data for page "\/large-page-data" is 256 kB which exceeds the threshold of 128 kB, this amount of data can reduce performance/
      )
      await renderViaHTTP(next.url, '/blocking-fallback/lots-of-data')
      await check(
        () => next.cliOutput,
        /Warning: data for page "\/blocking-fallback\/\[slug\]" \(path "\/blocking-fallback\/lots-of-data"\) is 256 kB which exceeds the threshold of 128 kB, this amount of data can reduce performance/
      )
    })

    if ((global as any).isNextDev) {
      it('should show warning every time page with large amount of page data is returned', async () => {
        await renderViaHTTP(next.url, '/large-page-data-ssr')
        await check(
          () => next.cliOutput,
          /Warning: data for page "\/large-page-data-ssr" is 256 kB which exceeds the threshold of 128 kB, this amount of data can reduce performance/
        )

        const outputIndex = next.cliOutput.length
        await renderViaHTTP(next.url, '/large-page-data-ssr')
        await check(
          () => next.cliOutput.slice(outputIndex),
          /Warning: data for page "\/large-page-data-ssr" is 256 kB which exceeds the threshold of 128 kB, this amount of data can reduce performance/
        )
      })
    }

    if ((global as any).isNextStart) {
      it('should only show warning once per page when large amount of page data is returned', async () => {
        await renderViaHTTP(next.url, '/large-page-data-ssr')
        await check(
          () => next.cliOutput,
          /Warning: data for page "\/large-page-data-ssr" is 256 kB which exceeds the threshold of 128 kB, this amount of data can reduce performance/
        )

        const outputIndex = next.cliOutput.length
        await renderViaHTTP(next.url, '/large-page-data-ssr')
        expect(next.cliOutput.slice(outputIndex)).not.toInclude(
          'Warning: data for page'
        )
      })
    }

    if ((global as any).isNextDev) {
      it('should not show warning from url prop being returned', async () => {
        await next.patchFile(
          'pages/url-prop.js',
          `
        export async function getStaticProps() {
          return {
            props: {
              url: 'something'
            }
          }
        }

        export default ({ url }) => <p>url: {url}</p>
      `,
          async () =>
            retry(async () => {
              const html = await renderViaHTTP(next.url, '/url-prop')
              expect(next.cliOutput).not.toMatch(
                /The prop `url` is a reserved prop in Next.js for legacy reasons and will be overridden on page \/url-prop/
              )
              expect(html).toMatch(/url:.*?something/)
            })
        )
      })

      it('should always show fallback for page not in getStaticPaths', async () => {
        const html = await renderViaHTTP(next.url, '/blog/post-321')
        const $ = cheerio.load(html)
        expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(true)

        // make another request to ensure it still is
        const html2 = await renderViaHTTP(next.url, '/blog/post-321')
        const $2 = cheerio.load(html2)
        expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(true)
      })

      it('should not show fallback for page in getStaticPaths', async () => {
        const html = await renderViaHTTP(next.url, '/blog/post-1')
        const $ = cheerio.load(html)
        expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)

        // make another request to ensure it's still not
        const html2 = await renderViaHTTP(next.url, '/blog/post-1')
        const $2 = cheerio.load(html2)
        expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(false)
      })

      it('should never show fallback for page not in getStaticPaths when blocking', async () => {
        const html = await renderViaHTTP(
          next.url,
          '/blocking-fallback-some/asf'
        )
        const $ = cheerio.load(html)
        expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)

        // make another request to ensure it still is
        const html2 = await renderViaHTTP(
          next.url,
          '/blocking-fallback-some/asf'
        )
        const $2 = cheerio.load(html2)
        expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(false)
      })

      it('should not show fallback for page in getStaticPaths when blocking', async () => {
        const html = await renderViaHTTP(next.url, '/blocking-fallback-some/b')
        const $ = cheerio.load(html)
        expect(JSON.parse($('#__NEXT_DATA__').text()).isFallback).toBe(false)

        // make another request to ensure it's still not
        const html2 = await renderViaHTTP(next.url, '/blocking-fallback-some/b')
        const $2 = cheerio.load(html2)
        expect(JSON.parse($2('#__NEXT_DATA__').text()).isFallback).toBe(false)
      })

      it('should always call getStaticProps without caching in dev', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/something')
        expect(isCachingHeader(initialRes.headers.get('cache-control'))).toBe(
          false
        )
        const initialHtml = await initialRes.text()
        expect(initialHtml).toMatch(/hello.*?world/)

        const newRes = await fetchViaHTTP(next.url, '/something')
        expect(isCachingHeader(newRes.headers.get('cache-control'))).toBe(false)
        const newHtml = await newRes.text()
        expect(newHtml).toMatch(/hello.*?world/)
        expect(initialHtml !== newHtml).toBe(true)

        const newerRes = await fetchViaHTTP(next.url, '/something')
        expect(isCachingHeader(newerRes.headers.get('cache-control'))).toBe(
          false
        )
        const newerHtml = await newerRes.text()
        expect(newerHtml).toMatch(/hello.*?world/)
        expect(newHtml !== newerHtml).toBe(true)
      })

      it('should error on bad object from getStaticProps', async () => {
        await next.patchFile(
          'pages/index.js',
          (content) => content.replace(/\/\/ bad-prop/, 'another: true,'),
          async () =>
            retry(async () => {
              const html = await renderViaHTTP(next.url, '/')
              expect(html).toMatch(/Additional keys were returned/)
            })
        )
      })

      it('should error on dynamic page without getStaticPaths', async () => {
        await next.patchFile(
          'pages/temp/[slug].js',
          `
          export async function getStaticProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          export default () => 'oops'
        `,
          async () =>
            retry(async () => {
              const html = await renderViaHTTP(next.url, '/temp/hello')
              expect(html).toMatch(
                /getStaticPaths is required for dynamic SSG pages and is missing for/
              )
            })
        )
      })

      it('should error on dynamic page without getStaticPaths returning fallback property', async () => {
        await next.patchFile(
          'pages/temp2/[slug].js',
          `
          export async function getStaticPaths() {
            return {
              paths: []
            }
          }
          export async function getStaticProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          export default () => 'oops'
        `,
          async () =>
            retry(async () => {
              const html = await renderViaHTTP(next.url, '/temp2/hello')
              expect(html).toMatch(/`fallback` key must be returned from/)
            })
        )
      })

      it('should not re-call getStaticProps when updating query', async () => {
        const browser = await webdriver(next.url, '/something?hello=world')
        await waitFor(2000)

        const query = await browser.elementByCss('#query').text()
        expect(JSON.parse(query)).toEqual({ hello: 'world' })

        const {
          props: {
            pageProps: { random: initialRandom },
          },
        } = await browser.eval('window.__NEXT_DATA__')

        const curRandom = await browser.elementByCss('#random').text()
        expect(curRandom).toBe(initialRandom + '')
      })

      it('should show fallback before invalid JSON is returned from getStaticProps', async () => {
        const html = await renderViaHTTP(next.url, '/non-json/foobar')
        expect(html).toContain('"isFallback":true')
      })

      it('should not fallback before invalid JSON is returned from getStaticProps when blocking fallback', async () => {
        const html = await renderViaHTTP(next.url, '/non-json-blocking/foobar')
        expect(html).toContain('"isFallback":false')
      })

      it('should show error for invalid JSON returned from getStaticProps on SSR', async () => {
        const browser = await webdriver(next.url, '/non-json/direct')

        // FIXME: enable this
        // expect(await getRedboxHeader(browser)).toMatch(
        //   /Error serializing `.time` returned from `getStaticProps`/
        // )

        // FIXME: disable this
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch(
          /Failed to load static props/
        )
      })

      it('should show error for invalid JSON returned from getStaticProps on CST', async () => {
        const browser = await webdriver(next.url, '/')
        await browser.elementByCss('#non-json').click()

        // FIXME: enable this
        // expect(await getRedboxHeader(browser)).toMatch(
        //   /Error serializing `.time` returned from `getStaticProps`/
        // )

        // FIXME: disable this
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch(
          /Failed to load static props/
        )
      })

      it('should not contain headers already sent error', async () => {
        await renderViaHTTP(next.url, '/fallback-only/some-fallback-post')
        expect(next.cliOutput).not.toContain('ERR_HTTP_HEADERS_SENT')
      })
    } else {
      it('should use correct caching headers for a no-revalidate page', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/something')
        expect(initialRes.headers.get('cache-control')).toBe(
          isDeploy ? 'public, max-age=0, must-revalidate' : 's-maxage=31536000'
        )
        const initialHtml = await initialRes.text()
        expect(initialHtml).toMatch(/hello.*?world/)
      })

      it('should not show error for invalid JSON returned from getStaticProps on SSR', async () => {
        const browser = await webdriver(next.url, '/non-json/direct')

        await check(() => getBrowserBodyText(browser), /hello /)
      })

      it('should not show error for invalid JSON returned from getStaticProps on CST', async () => {
        const browser = await webdriver(next.url, '/')
        await browser.elementByCss('#non-json').click()
        await check(() => getBrowserBodyText(browser), /hello /)
      })

      if ((global as any).isNextStart && !isDeploy) {
        it('outputs dataRoutes in routes-manifest correctly', async () => {
          const { dataRoutes } = JSON.parse(
            await next.readFile('.next/routes-manifest.json')
          )

          for (const route of dataRoutes) {
            route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)
          }

          expect(dataRoutes).toEqual([
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(next.buildId)}\\/index\\.json$`
              ),
              page: '/',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/another\\.json$`
              ),
              page: '/another',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/api\\-docs\\/(.+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/api\\-docs/(?<nxtPslug>.+?)\\.json$`,
              page: '/api-docs/[...slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/bad-gssp\\.json$`
              ),
              page: '/bad-gssp',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/bad-ssr\\.json$`
              ),
              page: '/bad-ssr',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/blocking\\-fallback\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/blocking\\-fallback/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/blocking-fallback/[slug]',
              routeKeys: { nxtPslug: 'nxtPslug' },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/blocking\\-fallback\\-once\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/blocking\\-fallback\\-once/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/blocking-fallback-once/[slug]',
              routeKeys: { nxtPslug: 'nxtPslug' },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/blocking\\-fallback\\-some\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/blocking\\-fallback\\-some/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/blocking-fallback-some/[slug]',
              routeKeys: { nxtPslug: 'nxtPslug' },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(next.buildId)}\\/blog\\.json$`
              ),
              page: '/blog',
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/blog/(?<nxtPpost>[^/]+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/blog\\/([^\\/]+?)\\.json$`
              ),
              page: '/blog/[post]',
              routeKeys: {
                nxtPpost: 'nxtPpost',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/blog/(?<nxtPpost>[^/]+?)/(?<nxtPcomment>[^/]+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`
              ),
              page: '/blog/[post]/[comment]',
              routeKeys: {
                nxtPpost: 'nxtPpost',
                nxtPcomment: 'nxtPcomment',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/catchall/(?<nxtPslug>.+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/catchall\\/(.+?)\\.json$`
              ),
              page: '/catchall/[...slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/catchall\\-explicit/(?<nxtPslug>.+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/catchall\\-explicit\\/(.+?)\\.json$`
              ),
              page: '/catchall-explicit/[...slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/catchall\\-optional(?:/(?<nxtPslug>.+?))?\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/catchall\\-optional(?:\\/(.+?))?\\.json$`
              ),
              page: '/catchall-optional/[[...slug]]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/default-revalidate\\.json$`
              ),
              page: '/default-revalidate',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/dynamic\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/dynamic/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/dynamic/[slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/fallback\\-only\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/fallback\\-only/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/fallback-only/[slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            // TODO: investigate index/index
            // {
            //   dataRouteRegex: normalizeRegEx(
            //     `^\\/_next\\/data\\/${escapeRegex(
            //       next.buildId
            //     )}\\/index\\/index\\.json$`
            //   ),
            //   page: '/index',
            // },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(next.buildId)}\\/fallback\\-true\\/([^\\/]+?)\\.json$`
              ),
              namedDataRouteRegex: `^/_next/data/${escapeRegex(next.buildId)}/fallback\\-true/(?<nxtPslug>[^/]+?)\\.json$`,
              page: '/fallback-true/[slug]',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/lang/(?<nxtPlang>[^/]+?)/about\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/lang\\/([^\\/]+?)\\/about\\.json$`
              ),
              page: '/lang/[lang]/about',
              routeKeys: {
                nxtPlang: 'nxtPlang',
              },
            },
            {
              dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
                next.buildId
              )}\\/large-page-data\\.json$`,
              page: '/large-page-data',
            },
            {
              dataRouteRegex: `^\\/_next\\/data\\/${escapeRegex(
                next.buildId
              )}\\/large-page-data-ssr\\.json$`,
              page: '/large-page-data-ssr',
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/non\\-json/(?<nxtPp>[^/]+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/non\\-json\\/([^\\/]+?)\\.json$`
              ),
              page: '/non-json/[p]',
              routeKeys: {
                nxtPp: 'nxtPp',
              },
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/non\\-json\\-blocking/(?<nxtPp>[^/]+?)\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/non\\-json\\-blocking\\/([^\\/]+?)\\.json$`
              ),
              page: '/non-json-blocking/[p]',
              routeKeys: {
                nxtPp: 'nxtPp',
              },
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/preview\\.json$`
              ),
              page: '/preview',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/something\\.json$`
              ),
              page: '/something',
            },
            {
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(next.buildId)}\\/ssr\\.json$`
              ),
              page: '/ssr',
            },
            {
              namedDataRouteRegex: `^/_next/data/${escapeRegex(
                next.buildId
              )}/user/(?<nxtPuser>[^/]+?)/profile\\.json$`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapeRegex(
                  next.buildId
                )}\\/user\\/([^\\/]+?)\\/profile\\.json$`
              ),
              page: '/user/[user]/profile',
              routeKeys: {
                nxtPuser: 'nxtPuser',
              },
            },
          ])
        })

        it('outputs a prerender-manifest correctly', async () => {
          const manifest = JSON.parse(
            await next.readFile('.next/prerender-manifest.json')
          )
          const escapedBuildId = escapeRegex(next.buildId)

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
          expect(manifest.routes).toEqual(expectedManifestRoutes())
          expect(manifest.dynamicRoutes).toEqual({
            '/api-docs/[...slug]': {
              dataRoute: `/_next/data/${next.buildId}/api-docs/[...slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/api\\-docs\\/(.+?)\\.json$`
              ),
              fallback: '/api-docs/[...slug].html',
              routeRegex: normalizeRegEx(`^\\/api\\-docs\\/(.+?)(?:\\/)?$`),
              allowHeader,
            },
            '/blocking-fallback-once/[slug]': {
              dataRoute: `/_next/data/${next.buildId}/blocking-fallback-once/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/blocking\\-fallback\\-once\\/([^\\/]+?)\\.json$`
              ),
              fallback: null,
              routeRegex: normalizeRegEx(
                '^\\/blocking\\-fallback\\-once\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/blocking-fallback-some/[slug]': {
              dataRoute: `/_next/data/${next.buildId}/blocking-fallback-some/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/blocking\\-fallback\\-some\\/([^\\/]+?)\\.json$`
              ),
              fallback: null,
              routeRegex: normalizeRegEx(
                '^\\/blocking\\-fallback\\-some\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/blocking-fallback/[slug]': {
              dataRoute: `/_next/data/${next.buildId}/blocking-fallback/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/blocking\\-fallback\\/([^\\/]+?)\\.json$`
              ),
              fallback: null,
              routeRegex: normalizeRegEx(
                '^\\/blocking\\-fallback\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/blog/[post]': {
              fallback: '/blog/[post].html',
              dataRoute: `/_next/data/${next.buildId}/blog/[post].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\.json$`
              ),
              routeRegex: normalizeRegEx('^\\/blog\\/([^\\/]+?)(?:\\/)?$'),
              allowHeader,
            },
            '/blog/[post]/[comment]': {
              fallback: '/blog/[post]/[comment].html',
              dataRoute: `/_next/data/${next.buildId}/blog/[post]/[comment].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/blog\\/([^\\/]+?)\\/([^\\/]+?)\\.json$`
              ),
              routeRegex: normalizeRegEx(
                '^\\/blog\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/dynamic/[slug]': {
              dataRoute: `/_next/data/${next.buildId}/dynamic/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/dynamic\\/([^\\/]+?)\\.json$`
              ),
              fallback: false,
              routeRegex: normalizeRegEx(`^\\/dynamic\\/([^\\/]+?)(?:\\/)?$`),
              allowHeader,
            },
            '/fallback-only/[slug]': {
              dataRoute: `/_next/data/${next.buildId}/fallback-only/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/fallback\\-only\\/([^\\/]+?)\\.json$`
              ),
              fallback: '/fallback-only/[slug].html',
              routeRegex: normalizeRegEx(
                '^\\/fallback\\-only\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/fallback-true/[slug]': {
              allowHeader,
              dataRoute: `/_next/data/${next.buildId}/fallback-true/[slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/fallback\\-true\\/([^\\/]+?)\\.json$`
              ),
              fallback: '/fallback-true/[slug].html',
              routeRegex: normalizeRegEx(
                '^\\/fallback\\-true\\/([^\\/]+?)(?:\\/)?$'
              ),
            },
            '/lang/[lang]/about': {
              dataRoute: `/_next/data/${next.buildId}/lang/[lang]/about.json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/lang\\/([^\\/]+?)\\/about\\.json$`
              ),
              fallback: false,
              routeRegex: normalizeRegEx(
                '^\\/lang\\/([^\\/]+?)\\/about(?:\\/)?$'
              ),
              allowHeader,
            },
            '/non-json-blocking/[p]': {
              dataRoute: `/_next/data/${next.buildId}/non-json-blocking/[p].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/non\\-json\\-blocking\\/([^\\/]+?)\\.json$`
              ),
              fallback: null,
              routeRegex: normalizeRegEx(
                '^\\/non\\-json\\-blocking\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/non-json/[p]': {
              dataRoute: `/_next/data/${next.buildId}/non-json/[p].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/non\\-json\\/([^\\/]+?)\\.json$`
              ),
              fallback: '/non-json/[p].html',
              routeRegex: normalizeRegEx(
                '^\\/non\\-json\\/([^\\/]+?)(?:\\/)?$'
              ),
              allowHeader,
            },
            '/user/[user]/profile': {
              fallback: '/user/[user]/profile.html',
              dataRoute: `/_next/data/${next.buildId}/user/[user]/profile.json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/user\\/([^\\/]+?)\\/profile\\.json$`
              ),
              routeRegex: normalizeRegEx(
                `^\\/user\\/([^\\/]+?)\\/profile(?:\\/)?$`
              ),
              allowHeader,
            },

            '/catchall/[...slug]': {
              fallback: '/catchall/[...slug].html',
              routeRegex: normalizeRegEx('^\\/catchall\\/(.+?)(?:\\/)?$'),
              dataRoute: `/_next/data/${next.buildId}/catchall/[...slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\/(.+?)\\.json$`
              ),
              allowHeader,
            },
            '/catchall-optional/[[...slug]]': {
              dataRoute: `/_next/data/${next.buildId}/catchall-optional/[[...slug]].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\-optional(?:\\/(.+?))?\\.json$`
              ),
              fallback: false,
              routeRegex: normalizeRegEx(
                '^\\/catchall\\-optional(?:\\/(.+?))?(?:\\/)?$'
              ),
              allowHeader,
            },
            '/catchall-explicit/[...slug]': {
              dataRoute: `/_next/data/${next.buildId}/catchall-explicit/[...slug].json`,
              dataRouteRegex: normalizeRegEx(
                `^\\/_next\\/data\\/${escapedBuildId}\\/catchall\\-explicit\\/(.+?)\\.json$`
              ),
              fallback: false,
              routeRegex: normalizeRegEx(
                '^\\/catchall\\-explicit\\/(.+?)(?:\\/)?$'
              ),
              allowHeader,
            },
          })
        })

        it('outputs prerendered files correctly', async () => {
          const routes = [
            '/another',
            '/something',
            '/blog/post-1',
            '/blog/post-2/comment-2',
          ]

          for (const route of routes) {
            await next.readFile(join('.next/server/pages', `${route}.html`))
            await next.readFile(join('.next/server/pages', `${route}.json`))
          }
        })

        it('should handle de-duping correctly', async () => {
          let vals = new Array(10).fill(null)

          // use data route so we don't get the fallback
          vals = await Promise.all(
            vals.map(() =>
              renderViaHTTP(
                next.url,
                `/_next/data/${next.buildId}/blog/post-10.json`
              )
            )
          )
          const val = vals[0]

          expect(JSON.parse(val).pageProps.post).toBe('post-10')
          expect(new Set(vals).size).toBe(1)
        })
      }

      it('should not revalidate when set to false', async () => {
        const route = '/something'
        const initialHtml = await renderViaHTTP(next.url, route)
        let newHtml = await renderViaHTTP(next.url, route)
        expect(initialHtml).toBe(newHtml)

        newHtml = await renderViaHTTP(next.url, route)
        expect(initialHtml).toBe(newHtml)

        newHtml = await renderViaHTTP(next.url, route)
        expect(initialHtml).toBe(newHtml)
      })

      if (!isDeploy) {
        // we can't guarantee cache time for deploy
        it('should not revalidate when set to false in blocking fallback mode', async () => {
          const route = '/blocking-fallback-once/test-no-revalidate'

          const initialHtml = await renderViaHTTP(next.url, route)
          let newHtml = await renderViaHTTP(next.url, route)
          expect(initialHtml).toBe(newHtml)

          newHtml = await renderViaHTTP(next.url, route)
          expect(initialHtml).toBe(newHtml)

          newHtml = await renderViaHTTP(next.url, route)
          expect(initialHtml).toBe(newHtml)
        })
      }

      it('should not throw error for on-demand revalidate for SSR path', async () => {
        const res = await fetchViaHTTP(next.url, '/api/manual-revalidate', {
          pathname: '/ssr',
        })

        expect(res.status).toBe(200)
        expect(stripAnsi(next.cliOutput)).not.toContain('hasHeader')
      })

      it('should revalidate on-demand revalidate with preview cookie', async () => {
        const initialRes = await fetchViaHTTP(next.url, '/preview')
        expect(initialRes.status).toBe(200)

        const initial$ = cheerio.load(await initialRes.text())
        const initialProps = JSON.parse(initial$('#props').text())

        expect(initialProps).toEqual({
          preview: false,
          previewData: null,
        })

        const previewRes = await fetchViaHTTP(next.url, '/api/enable')
        let previewCookie = ''

        expect(previewRes.headers.get('set-cookie')).toMatch(
          /(__prerender_bypass|__next_preview_data)/
        )

        previewRes.headers
          .get('set-cookie')
          .split(',')
          .forEach((s) => {
            const c = cookie.parse(s)
            const isBypass = c.__prerender_bypass

            if (isBypass || c.__next_preview_data) {
              if (previewCookie) previewCookie += '; '

              previewCookie += `${
                isBypass ? '__prerender_bypass' : '__next_preview_data'
              }=${c[isBypass ? '__prerender_bypass' : '__next_preview_data']}`
            }
          })

        const apiRes = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          { pathname: '/preview' },
          {
            headers: {
              cookie: previewCookie,
            },
          }
        )

        expect(apiRes.status).toBe(200)
        expect(await apiRes.json()).toEqual({ revalidated: true })

        const postRevalidateRes = await fetchViaHTTP(next.url, '/preview')
        expect(initialRes.status).toBe(200)

        const postRevalidate$ = cheerio.load(await postRevalidateRes.text())
        const postRevalidateProps = JSON.parse(postRevalidate$('#props').text())

        expect(postRevalidateProps).toEqual({
          preview: false,
          previewData: null,
        })
      })

      it('should handle revalidating HTML correctly', async () => {
        const route = '/blog/post-2/comment-2'
        const initialHtml = await renderViaHTTP(next.url, route)
        expect(initialHtml).toMatch(/Post:.*?post-2/)
        expect(initialHtml).toMatch(/Comment:.*?comment-2/)

        let newHtml = await renderViaHTTP(next.url, route)
        expect(newHtml).toMatch(/Post:.*?post-2/)
        expect(newHtml).toMatch(/Comment:.*?comment-2/)

        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newHtml = await renderViaHTTP(next.url, route)
          return newHtml !== initialHtml ? 'success' : newHtml
        }, 'success')

        expect(newHtml === initialHtml).toBe(false)
        expect(newHtml).toMatch(/Post:.*?post-2/)
        expect(newHtml).toMatch(/Comment:.*?comment-2/)
      })

      it('should handle revalidating JSON correctly', async () => {
        const route = `/_next/data/${next.buildId}/blog/post-2/comment-3.json`
        const initialJson = await renderViaHTTP(next.url, route)
        expect(initialJson).toMatch(/post-2/)
        expect(initialJson).toMatch(/comment-3/)

        let newJson = await renderViaHTTP(next.url, route)

        if (!isDeploy) {
          // we can't guarantee cache time on deploy
          expect(newJson).toBe(initialJson)
        }

        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newJson = await renderViaHTTP(next.url, route)
          return newJson !== initialJson ? 'success' : newJson
        }, 'success')

        expect(newJson === initialJson).toBe(false)
        expect(newJson).toMatch(/post-2/)
        expect(newJson).toMatch(/comment-3/)
      })

      it('should handle revalidating HTML correctly with blocking', async () => {
        const route = '/blocking-fallback/pewpew'
        const initialHtml = await renderViaHTTP(next.url, route)
        expect(initialHtml).toMatch(/Post:.*?pewpew/)

        let newHtml = await renderViaHTTP(next.url, route)

        if (!isDeploy) {
          // we can't guarantee the cache timing on deployment
          expect(newHtml).toBe(initialHtml)
        }
        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newHtml = await renderViaHTTP(next.url, route)
          return newHtml !== initialHtml ? 'success' : newHtml
        }, 'success')

        expect(newHtml === initialHtml).toBe(false)
        expect(newHtml).toMatch(/Post:.*?pewpew/)
      })

      it('should handle revalidating JSON correctly with blocking', async () => {
        const route = `/_next/data/${next.buildId}/blocking-fallback/pewpewdata.json`
        const initialJson = await renderViaHTTP(next.url, route)
        expect(initialJson).toMatch(/pewpewdata/)

        let newJson = await renderViaHTTP(next.url, route)

        if (!isDeploy) {
          // we can't guarantee the cache on deploy
          expect(newJson).toBe(initialJson)
        }
        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newJson = await renderViaHTTP(next.url, route)
          return newJson !== initialJson ? 'success' : newJson
        }, 'success')

        expect(newJson === initialJson).toBe(false)
        expect(newJson).toMatch(/pewpewdata/)
      })

      it('should handle revalidating HTML correctly with blocking and seed', async () => {
        const route = '/blocking-fallback/a'
        const initialHtml = await renderViaHTTP(next.url, route)
        const $initial = cheerio.load(initialHtml)
        expect($initial('p').text()).toBe('Post: a')

        let newHtml = await renderViaHTTP(next.url, route)

        if (!isDeploy) {
          // we can't guarantee the cache time on deploy
          expect(newHtml).toBe(initialHtml)
        }

        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newHtml = await renderViaHTTP(next.url, route)
          return newHtml !== initialHtml ? 'success' : newHtml
        }, 'success')

        expect(newHtml === initialHtml).toBe(false)
        const $new = cheerio.load(newHtml)
        expect($new('p').text()).toBe('Post: a')
      })

      it('should handle revalidating JSON correctly with blocking and seed', async () => {
        const route = `/_next/data/${next.buildId}/blocking-fallback/b.json`
        const initialJson = await renderViaHTTP(next.url, route)
        expect(JSON.parse(initialJson)).toMatchObject({
          pageProps: { params: { slug: 'b' } },
        })

        let newJson = await renderViaHTTP(next.url, route)

        if (!isDeploy) {
          // we can't guarantee the cache time on deploy
          expect(newJson).toBe(initialJson)
        }
        await waitFor(2 * 1000)
        await renderViaHTTP(next.url, route)

        await check(async () => {
          newJson = await renderViaHTTP(next.url, route)
          return newJson !== initialJson ? 'success' : newJson
        }, 'success')

        expect(newJson === initialJson).toBe(false)
        expect(JSON.parse(newJson)).toMatchObject({
          pageProps: { params: { slug: 'b' } },
        })
      })

      it('should not fetch prerender data on mount', async () => {
        const browser = await webdriver(next.url, '/blog/post-100')
        await browser.eval('window.thisShouldStay = true')
        await waitFor(2 * 1000)
        const val = await browser.eval('window.thisShouldStay')
        expect(val).toBe(true)
      })

      it('should not error when flushing cache files', async () => {
        await fetchViaHTTP(next.url, '/user/user-1/profile')
        await waitFor(500)
        expect(next.cliOutput).not.toMatch(
          /Failed to update prerender files for/
        )
      })
    }

    if ((global as any).isNextStart) {
      it('should of formatted build output correctly', () => {
        expect(next.cliOutput).toMatch(/○ \/normal/)
        expect(next.cliOutput).toMatch(/● \/blog\/\[post\]/)
        expect(next.cliOutput).toMatch(/\+2 more paths/)
      })

      it('should output traces', async () => {
        const checks = [
          {
            page: '/_app',
            tests: [
              /(webpack-runtime\.js|\[turbopack\]_runtime\.js)/,
              /node_modules\/react\/index\.js/,
              /node_modules\/react\/package\.json/,
              isReact18
                ? /node_modules\/react\/cjs\/react\.production\.min\.js/
                : /node_modules\/react\/cjs\/react\.production\.js/,
            ],
            notTests: [],
          },
          {
            page: '/another',
            tests: [
              /(webpack-runtime\.js|\[turbopack\]_runtime\.js)/,
              /chunks\/.*?\.js/,
              /node_modules\/react\/index\.js/,
              /node_modules\/react\/package\.json/,
              isReact18
                ? /node_modules\/react\/cjs\/react\.production\.min\.js/
                : /node_modules\/react\/cjs\/react\.production\.js/,
              /\/world.txt/,
            ],
            notTests: [
              /node_modules\/@firebase\/firestore\/.*?\.js/,
              /\/server\.js/,
            ],
          },
          {
            page: '/blog/[post]',
            tests: [
              /(webpack-runtime\.js|\[turbopack\]_runtime\.js)/,
              /chunks\/.*?\.js/,
              /node_modules\/react\/index\.js/,
              /node_modules\/react\/package\.json/,
              isReact18
                ? /node_modules\/react\/cjs\/react\.production\.min\.js/
                : /node_modules\/react\/cjs\/react\.production\.js/,
              /node_modules\/@firebase\/firestore\/.*?\.js/,
            ],
            notTests: [/\/world.txt/],
          },
        ]

        for (const check of checks) {
          const contents = await next.readFile(
            join('.next/server/pages/', check.page + '.js.nft.json')
          )
          const { version, files } = JSON.parse(contents)
          expect(version).toBe(1)

          try {
            expect(check.tests).toEqual(
              expect.toSatisfyAll((item) =>
                files.some((file) => item.test(file))
              )
            )
          } catch (error) {
            error.message += `\n\nPage: ${check.page}\nFiles:\n${files.join('\n')}`
            throw error
          }

          if (sep === '/') {
            expect(
              check.notTests.some((item) =>
                files.some((file) => item.test(file))
              )
            ).toBe(false)
          }
        }
      })
    }

    // This test is disabled in deployed environments because the initial on-demand revalidate call
    // is not actually producing a new response, until it's called for a second time
    // Rather than retrying just to fix the test, we need to investigate what might
    // be causing this behavior in a deployed environment.
    if (!isDev && !isDeploy) {
      it('should handle on-demand revalidate for fallback: blocking', async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/blocking-fallback/test-manual-1'
        )

        const html = await res.text()
        const $ = cheerio.load(html)
        const initialTime = $('#time').text()
        const cacheHeader = isDeploy ? 'x-vercel-cache' : 'x-nextjs-cache'

        expect(res.headers.get(cacheHeader)).toMatch(/MISS/)
        expect($('p').text()).toMatch(/Post:.*?test-manual-1/)

        // we use retry here as the cache might still be
        // writing to disk even after the above request has finished
        await retry(async () => {
          const res2 = await fetchViaHTTP(
            next.url,
            '/blocking-fallback/test-manual-1'
          )
          const html2 = await res2.text()
          const $2 = cheerio.load(html2)

          expect(res2.headers.get(cacheHeader)).toMatch(/(HIT|STALE)/)
          expect(initialTime).toBe($2('#time').text())
        })

        const res3 = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/blocking-fallback/test-manual-1',
          },
          { redirect: 'manual' }
        )

        expect(res3.status).toBe(200)
        const revalidateData = await res3.json()
        expect(revalidateData.revalidated).toBe(true)

        await retry(async () => {
          const res4 = await fetchViaHTTP(
            next.url,
            '/blocking-fallback/test-manual-1'
          )
          const html4 = await res4.text()
          const $4 = cheerio.load(html4)

          expect($4('#time').text()).not.toBe(initialTime)
          expect(res4.headers.get(cacheHeader)).toMatch(/(HIT|STALE)/)
        })
      })
    }

    if (!isDev && !isDeploy) {
      it('should automatically reset cache TTL when an error occurs and build cache was available', async () => {
        await next.patchFile('error.txt', 'yes', async () => {
          await waitFor(2000)

          for (let i = 0; i < 5; i++) {
            const res = await fetchViaHTTP(
              next.url,
              '/blocking-fallback/test-errors-1'
            )
            expect(res.status).toBe(200)
          }

          return retry(async () => {
            expect(next.cliOutput).toMatch(
              /throwing error for \/blocking-fallback\/test-errors-1/
            )
          })
        })
      })

      it('should automatically reset cache TTL when an error occurs and runtime cache was available', async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/blocking-fallback/test-errors-2'
        )

        expect(res.status).toBe(200)
        await waitFor(2000)

        await next.patchFile('error.txt', 'yes', async () => {
          for (let i = 0; i < 5; i++) {
            const res = await fetchViaHTTP(
              next.url,
              '/blocking-fallback/test-errors-2'
            )
            expect(res.status).toBe(200)
          }

          return retry(async () => {
            expect(next.cliOutput).toMatch(
              /throwing error for \/blocking-fallback\/test-errors-2/
            )
          })
        })
      })

      it('should not on-demand revalidate for fallback: blocking with onlyGenerated if not generated', async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/blocking-fallback/test-if-generated-1',
            onlyGenerated: '1',
          },
          { redirect: 'manual' }
        )

        expect(res.status).toBe(200)
        const revalidateData = await res.json()
        expect(revalidateData.revalidated).toBe(true)

        expect(next.cliOutput).not.toContain(
          `getStaticProps test-if-generated-1`
        )

        const res2 = await fetchViaHTTP(
          next.url,
          '/blocking-fallback/test-if-generated-1'
        )
        expect(res2.headers.get('x-nextjs-cache')).toMatch(/(MISS)/)
        expect(next.cliOutput).toContain(`getStaticProps test-if-generated-1`)
      })

      it('should on-demand revalidate for fallback: blocking with onlyGenerated if generated', async () => {
        const beforeRevalidate = Date.now()
        const res = await fetchViaHTTP(
          next.url,
          '/blocking-fallback/test-if-generated-2'
        )
        await waitForCacheWrite(
          '/blocking-fallback/test-if-generated-2',
          beforeRevalidate
        )
        const html = await res.text()
        const $ = cheerio.load(html)
        const initialTime = $('#time').text()
        expect($('p').text()).toMatch(/Post:.*?test-if-generated-2/)
        expect(res.headers.get('x-nextjs-cache')).toMatch(/MISS/)

        await retry(async () => {
          const res2 = await fetchViaHTTP(
            next.url,
            '/blocking-fallback/test-if-generated-2'
          )
          const html2 = await res2.text()
          const $2 = cheerio.load(html2)

          expect(initialTime).toBe($2('#time').text())
          expect(res2.headers.get('x-nextjs-cache')).toMatch(/(HIT|STALE)/)
        })

        const res3 = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/blocking-fallback/test-if-generated-2',
            onlyGenerated: '1',
          },
          { redirect: 'manual' }
        )

        expect(res3.status).toBe(200)
        const revalidateData = await res3.json()
        expect(revalidateData.revalidated).toBe(true)

        await retry(async () => {
          const res4 = await fetchViaHTTP(
            next.url,
            '/blocking-fallback/test-if-generated-2'
          )
          const html4 = await res4.text()
          const $4 = cheerio.load(html4)
          expect($4('#time').text()).not.toBe(initialTime)
          expect(res4.headers.get('x-nextjs-cache')).toMatch(/(HIT|STALE)/)
        })
      })

      it('should on-demand revalidate for revalidate: false', async () => {
        const html = await renderViaHTTP(
          next.url,
          '/blocking-fallback-once/test-manual-1'
        )
        const $ = cheerio.load(html)
        const initialTime = $('#time').text()

        expect($('p').text()).toMatch(/Post:.*?test-manual-1/)

        const html2 = await renderViaHTTP(
          next.url,
          '/blocking-fallback-once/test-manual-1'
        )
        const $2 = cheerio.load(html2)

        expect(initialTime).toBe($2('#time').text())

        const res = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/blocking-fallback-once/test-manual-1',
          },
          { redirect: 'manual' }
        )

        expect(res.status).toBe(200)
        const revalidateData = await res.json()
        expect(revalidateData.revalidated).toBe(true)

        const html4 = await renderViaHTTP(
          next.url,
          '/blocking-fallback-once/test-manual-1'
        )
        const $4 = cheerio.load(html4)
        expect($4('#time').text()).not.toBe(initialTime)
      })

      it('should on-demand revalidate that returns notFound: true', async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/blocking-fallback-once/404-on-manual-revalidate'
        )
        const html = await res.text()
        const $ = cheerio.load(html)
        const initialTime = $('#time').text()
        expect(res.headers.get('x-nextjs-cache')).toBe('HIT')

        expect($('p').text()).toMatch(/Post:.*?404-on-manual-revalidate/)

        const html2 = await renderViaHTTP(
          next.url,
          '/blocking-fallback-once/404-on-manual-revalidate'
        )
        const $2 = cheerio.load(html2)

        expect(initialTime).toBe($2('#time').text())

        const res2 = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/blocking-fallback-once/404-on-manual-revalidate',
          },
          { redirect: 'manual' }
        )
        expect(res2.status).toBe(200)
        const revalidateData = await res2.json()
        expect(revalidateData.revalidated).toBe(true)

        const res3 = await fetchViaHTTP(
          next.url,
          '/blocking-fallback-once/404-on-manual-revalidate'
        )
        expect(res3.status).toBe(404)
        expect(await res3.text()).toContain('This page could not be found')
        expect(res3.headers.get('x-nextjs-cache')).toBe('HIT')
      })

      it('should handle on-demand revalidate for fallback: false', async () => {
        const res = await fetchViaHTTP(
          next.url,
          '/catchall-explicit/test-manual-1'
        )
        expect(res.status).toBe(404)

        // fallback: false pages should only manually revalidate
        // prerendered paths
        const res2 = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/catchall-explicity/test-manual-1',
          },
          { redirect: 'manual' }
        )

        expect(res2.status).toBe(200)
        const revalidateData = await res2.json()
        expect(revalidateData.revalidated).toBe(false)

        const res3 = await fetchViaHTTP(
          next.url,
          '/catchall-explicit/test-manual-1'
        )
        expect(res3.status).toBe(404)

        const res4 = await fetchViaHTTP(next.url, '/catchall-explicit/first')
        expect(res4.status).toBe(200)
        const html = await res4.text()
        const $ = cheerio.load(html)
        const initialTime = $('#time').text()

        const res5 = await fetchViaHTTP(
          next.url,
          '/api/manual-revalidate',
          {
            pathname: '/catchall-explicit/first',
          },
          { redirect: 'manual' }
        )
        expect(res5.status).toBe(200)
        expect((await res5.json()).revalidated).toBe(true)

        const res6 = await fetchViaHTTP(next.url, '/catchall-explicit/first')
        expect(res6.status).toBe(200)
        const html2 = await res6.text()
        const $2 = cheerio.load(html2)

        expect(initialTime).not.toBe($2('#time').text())
      })
    }

    it('should respond for catch-all deep folder', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/catchall/first/second/third.json`
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('["first","second","third"]')
    })

    // this should come very last
    it('should not fail to update incremental cache', async () => {
      await waitFor(1000)
      expect(next.cliOutput).not.toContain('Failed to update prerender cache')
    })

    it('should not have experimental undici warning', async () => {
      await waitFor(1000)
      expect(next.cliOutput).not.toContain('option is unnecessary in Node.js')
    })

    it('should not have attempted sending invalid payload', async () => {
      expect(next.cliOutput).not.toContain('argument entity must be string')
    })
  }
  runTests((global as any).isNextDev, (global as any).isNextDeploy)
})
