import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'
import { check, fetchViaHTTP, waitFor } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('Prerender prefetch', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
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
})
