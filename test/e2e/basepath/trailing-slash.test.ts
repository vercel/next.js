import webdriver from 'next-webdriver'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('basePath + trailingSlash', () => {
  let next: NextInstance
  const basePath = '/docs'

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
      nextConfig: {
        trailingSlash: true,
        basePath,
        onDemandEntries: {
          // Make sure entries are not getting disposed.
          maxInactiveAge: 1000 * 60 * 60,
        },
      },
    })
  })
  afterAll(() => next.destroy())

  const runTests = (dev = false) => {
    it('should allow URL query strings without refresh', async () => {
      const browser = await webdriver(next.url, `${basePath}/hello/?query=true`)
      try {
        await browser.eval('window.itdidnotrefresh = "hello"')
        await new Promise((resolve, reject) => {
          // Timeout of EventSource created in setupPing()
          // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
          setTimeout(resolve, dev ? 10000 : 1000)
        })
        expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

        const pathname = await browser.elementByCss('#pathname').text()
        expect(pathname).toBe('/hello')
        expect(await browser.eval('window.location.pathname')).toBe(
          `${basePath}/hello/`
        )
        expect(await browser.eval('window.location.search')).toBe('?query=true')

        if (dev) {
          await assertNoRedbox(browser)
        }
      } finally {
        await browser.close()
      }
    })

    it('should allow URL query strings on index without refresh', async () => {
      const browser = await webdriver(next.url, `${basePath}/?query=true`)
      try {
        await browser.eval('window.itdidnotrefresh = "hello"')
        await new Promise((resolve, reject) => {
          // Timeout of EventSource created in setupPing()
          // (on-demand-entries-utils.js) is 5000 ms (see #13132, #13560)
          setTimeout(resolve, dev ? 10000 : 1000)
        })
        expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')

        const pathname = await browser.elementByCss('#pathname').text()
        expect(pathname).toBe('/')
        expect(await browser.eval('window.location.pathname')).toBe(
          basePath + '/'
        )
        expect(await browser.eval('window.location.search')).toBe('?query=true')

        if (dev) {
          await assertNoRedbox(browser)
        }
      } finally {
        await browser.close()
      }
    })

    it('should correctly replace state when same asPath but different url', async () => {
      const browser = await webdriver(next.url, `${basePath}/`)
      try {
        await browser.elementByCss('#hello-link').click()
        await browser.waitForElementByCss('#something-else-link')
        await browser.elementByCss('#something-else-link').click()
        await browser.waitForElementByCss('#something-else-page')
        await browser.back()
        await browser.waitForElementByCss('#index-page')
        await browser.forward()
        await browser.waitForElementByCss('#something-else-page')
      } finally {
        await browser.close()
      }
    })
  }
  runTests((global as any).isDev)
})
