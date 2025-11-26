import { NextInstance } from 'e2e-utils'
import { createNext, FileRef } from 'e2e-utils'
import {
  check,
  fetchViaHTTP,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'
import assert from 'assert'

describe('Prerender prefetch', () => {
  let next: NextInstance

  const runTests = ({
    optimisticClientCache,
  }: {
    optimisticClientCache?: boolean
  }) => {
    it('should not revalidate during prefetching', async () => {
      const cliOutputStart = next.cliOutput.length

      for (let i = 0; i < 3; i++) {
        for (const path of ['/blog/first', '/blog/second']) {
          const res = await fetchViaHTTP(
            next.url,
            `/_next/data/${next.buildId}${path}.json`,
            undefined,
            {
              headers: {
                purpose: 'prefetch',
              },
            }
          )
          expect(res.status).toBe(200)
        }
        // do requests three times with 1 second between
        // to go over revalidate period
        await waitFor(1000)
      }
      expect(next.cliOutput.substring(cliOutputStart)).not.toContain(
        'revalidating /blog'
      )
    })

    it('should trigger revalidation after navigation', async () => {
      const getData = () =>
        fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/first.json`,
          undefined,
          {
            headers: {
              purpose: 'prefetch',
            },
          }
        )
      const initialDataRes = await getData()
      const initialData = await initialDataRes.json()
      const browser = await webdriver(next.url, '/')

      await browser.elementByCss('#to-blog-first').click()

      await check(async () => {
        const data = await getData()
        assert.notDeepEqual(initialData, data)
        return 'success'
      }, 'success')
    })

    it('should update cache using prefetch with unstable_skipClientCache', async () => {
      const browser = await webdriver(next.url, '/')
      const timeRes = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/blog/first.json`,
        undefined,
        {
          headers: {
            purpose: 'prefetch',
          },
        }
      )
      const startTime = (await timeRes.json()).pageProps.now

      // ensure stale data is used by default
      await browser.elementByCss('#to-blog-first').click()
      const outputIndex = next.cliOutput.length

      await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

      expect(JSON.parse(await browser.elementByCss('#props').text()).now).toBe(
        startTime
      )
      await browser.back().waitForElementByCss('#to-blog-first')

      // trigger revalidation of /blog/first
      await check(async () => {
        await renderViaHTTP(next.url, '/blog/first')
        return next.cliOutput.substring(outputIndex)
      }, /revalidating \/blog first/)

      // wait for the revalidation to finish by comparing timestamps
      await retry(async () => {
        const timeRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/first.json`,
          undefined,
          {
            headers: {
              purpose: 'prefetch',
            },
          }
        )
        const updatedTime = (await timeRes.json()).pageProps.now
        expect(updatedTime).not.toBe(startTime)
      })

      // now trigger cache update and navigate again
      await browser.eval(
        'next.router.prefetch("/blog/first", undefined, { unstable_skipClientCache: true }).finally(() => { window.prefetchDone = "yes" })'
      )
      await check(() => browser.eval('window.prefetchDone'), 'yes')

      await browser.elementByCss('#to-blog-first').click()
      await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

      const newTime = JSON.parse(
        await browser.elementByCss('#props').text()
      ).now
      expect(newTime).not.toBe(startTime)
      expect(isNaN(newTime)).toBe(false)
    })

    it('should update cache using router.push with unstable_skipClientCache', async () => {
      const browser = await webdriver(next.url, '/')
      const timeRes = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/blog/first.json`,
        undefined,
        {
          headers: {
            purpose: 'prefetch',
          },
        }
      )
      const startTime = (await timeRes.json()).pageProps.now

      // ensure stale data is used by default
      await browser.elementByCss('#to-blog-first').click()
      const outputIndex = next.cliOutput.length

      await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

      expect(JSON.parse(await browser.elementByCss('#props').text()).now).toBe(
        startTime
      )
      await browser.back().waitForElementByCss('#to-blog-first')

      // trigger revalidation of /blog/first
      await check(async () => {
        await renderViaHTTP(next.url, '/blog/first')
        return next.cliOutput.substring(outputIndex)
      }, /revalidating \/blog first/)

      // wait for the revalidation to finish by comparing timestamps
      await retry(async () => {
        const timeRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/first.json`,
          undefined,
          {
            headers: {
              purpose: 'prefetch',
            },
          }
        )
        const updatedTime = (await timeRes.json()).pageProps.now
        expect(updatedTime).not.toBe(startTime)
      })

      // now trigger cache update and navigate again
      await browser.eval(
        'next.router.push("/blog/first", undefined, { unstable_skipClientCache: true }).finally(() => { window.prefetchDone = "yes" })'
      )
      await check(() => browser.eval('window.prefetchDone'), 'yes')

      await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

      const newTime = JSON.parse(
        await browser.elementByCss('#props').text()
      ).now
      expect(newTime).not.toBe(startTime)
      expect(isNaN(newTime)).toBe(false)
    })

    if (optimisticClientCache) {
      it('should attempt cache update on link hover/touch start', async () => {
        const browser = await webdriver(next.url, '/')
        const timeRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/blog/first.json`,
          undefined,
          {
            headers: {
              purpose: 'prefetch',
            },
          }
        )
        const startTime = (await timeRes.json()).pageProps.now

        // ensure stale data is used by default
        await browser.elementByCss('#to-blog-first').click()
        await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

        expect(
          JSON.parse(await browser.elementByCss('#props').text()).now
        ).toBe(startTime)
        await browser.back().waitForElementByCss('#to-blog-first')
        const requests = []

        browser.on('request', (req) => {
          requests.push(req.url())
        })

        // now trigger cache update and navigate again
        await check(async () => {
          if (process.env.DEVICE_NAME) {
            await browser.elementByCss('#to-blog-second').touchStart()
            await browser.elementByCss('#to-blog-first').touchStart()
          } else {
            await browser.elementByCss('#to-blog-second').moveTo()
            await browser.elementByCss('#to-blog-first').moveTo()
          }
          return requests.some((url) => url.includes('/blog/first.json'))
            ? 'success'
            : requests
        }, 'success')
      })
    } else {
      it('should not attempt client cache update on link hover/touch start', async () => {
        const browser = await webdriver(next.url, '/')
        let requests = []

        browser.on('request', (req) => {
          requests.push(req.url())
        })

        await check(async () => {
          const cacheKeys = await browser.eval(
            'Object.keys(window.next.router.sdc)'
          )
          return cacheKeys.some((url) => url.includes('/blog/first')) &&
            cacheKeys.some((url) => url.includes('/blog/second'))
            ? 'success'
            : JSON.stringify(requests, null, 2)
        }, 'success')

        requests = []

        if (process.env.DEVICE_NAME) {
          await browser.elementByCss('#to-blog-second').touchStart()
          await browser.elementByCss('#to-blog-first').touchStart()
        } else {
          await browser.elementByCss('#to-blog-second').moveTo()
          await browser.elementByCss('#to-blog-first').moveTo()
        }

        expect(requests.filter((url) => url.includes('.json'))).toEqual([])
      })
    }

    it('should handle failed data fetch and empty cache correctly', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#to-blog-first').click()

      // ensure we use the same port when restarting
      const port = new URL(next.url).port
      next.forcedPort = port

      // trigger new build so buildId changes
      await next.stop()
      await next.start()

      // clear router cache
      await browser.eval('window.next.router.sdc = {}')
      await browser.eval('window.beforeNav = 1')

      await browser.back()
      await browser.waitForElementByCss('#to-blog-first')
      expect(await browser.eval('window.beforeNav')).toBeFalsy()
    })
  }

  describe('with optimisticClientCache enabled', () => {
    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'app/pages')),
        },
        dependencies: {},
        env: {
          // Simulate that a CDN has consumed the SWR cache-control header,
          // otherwise the browser will cache responses and which messes with
          // the expectations in this test.
          // See https://github.com/vercel/next.js/pull/70674 for context.
          NEXT_PRIVATE_CDN_CONSUMED_SWR_CACHE_CONTROL: '1',
        },
      })
    })
    afterAll(() => next.destroy())

    runTests({ optimisticClientCache: true })
  })

  describe('with optimisticClientCache disabled', () => {
    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'app/pages')),
        },
        nextConfig: {
          experimental: {
            optimisticClientCache: false,
          },
        },
        dependencies: {},
        env: {
          // Simulate that a CDN has consumed the SWR cache-control header,
          // otherwise the browser will cache responses and which messes with
          // the expectations in this test.
          // See https://github.com/vercel/next.js/pull/70674 for context.
          NEXT_PRIVATE_CDN_CONSUMED_SWR_CACHE_CONTROL: '1',
        },
      })
    })
    afterAll(() => next.destroy())

    runTests({ optimisticClientCache: false })
  })
})
