import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'
import { check, fetchViaHTTP, renderViaHTTP, waitFor } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import webdriver from 'next-webdriver'
import assert from 'assert'

describe('Prerender prefetch', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should not revalidate during prefetching', async () => {
    const reqs = {}

    // get initial values
    for (const path of ['/blog/first', '/blog/second']) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())
      const props = JSON.parse($('#props').text())
      reqs[path] = props
    }

    const browser = await webdriver(next.url, '/')

    // wait for prefetch to occur
    await check(async () => {
      const cache = await browser.eval('JSON.stringify(window.next.router.sdc)')
      return cache.includes('/blog/first') && cache.includes('/blog/second')
        ? 'success'
        : cache
    }, 'success')

    await waitFor(3000)
    await browser.refresh()

    // reload after revalidate period and wait for prefetch again
    await check(async () => {
      const cache = await browser.eval('JSON.stringify(window.next.router.sdc)')
      return cache.includes('/blog/first') && cache.includes('/blog/second')
        ? 'success'
        : cache
    }, 'success')

    // ensure revalidate did not occur from prefetch
    for (const path of ['/blog/first', '/blog/second']) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())
      const props = JSON.parse($('#props').text())
      expect(props).toEqual(reqs[path])
    }
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

    // now trigger cache update and navigate again
    await browser.eval(
      'next.router.prefetch("/blog/first", undefined, { unstable_skipClientCache: true }).finally(() => { window.prefetchDone = "yes" })'
    )
    await check(() => browser.eval('window.prefetchDone'), 'yes')

    await browser.elementByCss('#to-blog-first').click()
    await check(() => browser.elementByCss('#page').text(), 'blog/[slug]')

    const newTime = JSON.parse(await browser.elementByCss('#props').text()).now
    expect(newTime).not.toBe(startTime)
    expect(isNaN(newTime)).toBe(false)
  })

  it('should attempt cache update on link hover', async () => {
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

    expect(JSON.parse(await browser.elementByCss('#props').text()).now).toBe(
      startTime
    )
    await browser.back().waitForElementByCss('#to-blog-first')
    const requests = []

    browser.on('request', (req) => {
      requests.push(req.url())
    })

    // now trigger cache update and navigate again
    await check(async () => {
      await browser.elementByCss('#to-blog-second').moveTo()
      await browser.elementByCss('#to-blog-first').moveTo()
      return requests.some((url) => url.includes('/blog/first.json'))
        ? 'success'
        : requests
    }, 'success')
  })

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
})
