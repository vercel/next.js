/* eslint-env jest */

import {
  check,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import http from 'http'
import httpProxy from 'http-proxy'
import webdriver from 'next-webdriver'
import { join } from 'path'
import { readFile } from 'fs-extra'

const appDir = join(__dirname, '../')
let app
let appPort
let stallJs
let proxyServer
let nextDataRequests = []

describe('Prefetching Links in viewport', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      const port = await findPort()
      app = await nextStart(appDir, port)
      appPort = await findPort()

      const proxy = httpProxy.createProxyServer({
        target: `http://localhost:${port}`,
      })

      proxyServer = http.createServer(async (req, res) => {
        if (stallJs && req.url.includes('chunks/pages/another')) {
          console.log('stalling request for', req.url)
          await new Promise((resolve) => setTimeout(resolve, 5 * 1000))
        }
        if (req.url.startsWith('/_next/data')) {
          nextDataRequests.push(req.url)
        }
        proxy.web(req, res)
      })

      proxy.on('error', (err) => {
        console.warn('Failed to proxy', err)
      })

      await new Promise((resolve) => {
        proxyServer.listen(appPort, () => resolve())
      })
    })
    afterAll(async () => {
      await killApp(app)
      proxyServer.close()
    })

    it('should de-dupe inflight SSG requests', async () => {
      nextDataRequests = []
      const browser = await webdriver(appPort, '/')
      await browser.eval(function navigate() {
        window.next.router.push('/ssg/slow')
        window.next.router.push('/ssg/slow')
        window.next.router.push('/ssg/slow')
      })
      await browser.waitForElementByCss('#content')
      expect(
        nextDataRequests.filter((reqUrl) => reqUrl.includes('/ssg/slow.json'))
          .length
      ).toBe(2)
    })

    it('should handle timed out prefetch correctly', async () => {
      try {
        stallJs = true
        const browser = await webdriver(appPort, '/')

        await browser.elementByCss('#scroll-to-another').click()
        // wait for preload to timeout
        await waitFor(6 * 1000)

        await browser
          .elementByCss('#link-another')
          .click()
          .waitForElementByCss('#another')

        expect(await browser.elementByCss('#another').text()).toBe(
          'Hello world'
        )
      } finally {
        stallJs = false
      }
    })

    it('should prefetch with link in viewport onload', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')

        await check(async () => {
          const links = await browser.elementsByCss('link[rel=prefetch]')
          let found = false

          for (const link of links) {
            const href = await link.getAttribute('href')
            if (href.includes('first')) {
              found = true
              break
            }
          }
          expect(found).toBe(true)
          return 'success'
        }, 'success')
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should prefetch with non-bot UA', async () => {
      let browser
      try {
        browser = await webdriver(
          appPort,
          `/bot-user-agent?useragent=${encodeURIComponent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36'
          )}`
        )
        const links = await browser.elementsByCss('link[rel=prefetch]')
        expect(links).toHaveLength(1)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should not prefetch with bot UA', async () => {
      let browser
      try {
        browser = await webdriver(
          appPort,
          `/bot-user-agent?useragent=${encodeURIComponent(
            'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
          )}`
        )
        const links = await browser.elementsByCss('link[rel=prefetch]')
        expect(links).toHaveLength(0)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should prefetch rewritten href with link in viewport onload', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/rewrite-prefetch')

        await check(async () => {
          const links = await browser.elementsByCss('link[rel=prefetch]')
          let found = false

          for (const link of links) {
            const href = await link.getAttribute('href')
            if (href.includes('%5Bslug%5D')) {
              found = true
              break
            }
          }
          expect(found).toBe(true)
          return 'success'
        }, 'success')

        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
          '/_next/data/test-build/ssg/dynamic/one.json',
        ])
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should prefetch with link in viewport when href changes', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await browser.elementByCss('button').click()
        await waitFor(2 * 1000)

        const links = await browser.elementsByCss('link[rel=prefetch]')
        let foundFirst = false
        let foundAnother = false

        for (const link of links) {
          const href = await link.getAttribute('href')
          if (href.includes('another')) foundAnother = true
          if (href.includes('first')) foundFirst = true
        }
        expect(foundFirst).toBe(true)
        expect(foundAnother).toBe(true)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should prefetch with link in viewport on scroll', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await browser.elementByCss('#scroll-to-another').click()
        await waitFor(2 * 1000)

        const links = await browser.elementsByCss('link[rel=prefetch]')
        let found = false

        for (const link of links) {
          const href = await link.getAttribute('href')
          if (href.includes('another')) {
            found = true
            break
          }
        }
        expect(found).toBe(true)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should prefetch with link in viewport and inject script on hover', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await browser.elementByCss('#scroll-to-another').click()
        await waitFor(2 * 1000)

        const links = await browser.elementsByCss('link[rel=prefetch]')
        let foundLink = false

        for (const link of links) {
          const href = await link.getAttribute('href')
          if (href.includes('another')) {
            foundLink = true
            break
          }
        }
        expect(foundLink).toBe(true)

        await browser.elementByCss('#link-another').moveTo()
        await waitFor(2 * 1000)

        const scripts = await browser.elementsByCss(
          // Mouse hover is a high-priority fetch
          'script:not([async])'
        )
        let scriptFound = false
        for (const aScript of scripts) {
          const href = await aScript.getAttribute('src')
          if (href.includes('another')) {
            scriptFound = true
            break
          }
        }
        expect(scriptFound).toBe(true)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should inject script on hover with prefetching disabled', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/prefetch-disabled')
        await waitFor(2 * 1000)

        const links = await browser.elementsByCss('link[rel=prefetch]')
        let foundLink = false

        for (const link of links) {
          const href = await link.getAttribute('href')
          if (href.includes('another')) {
            foundLink = true
            break
          }
        }
        expect(foundLink).toBe(false)

        async function hasAnotherScript() {
          const scripts = await browser.elementsByCss(
            // Mouse hover is a high-priority fetch
            'script:not([async])'
          )
          let scriptFound = false
          for (const aScript of scripts) {
            const href = await aScript.getAttribute('src')
            if (href.includes('another')) {
              scriptFound = true
              break
            }
          }
          return scriptFound
        }

        expect(await hasAnotherScript()).toBe(false)
        await browser.elementByCss('#link-another').moveTo()
        await waitFor(2 * 1000)
        expect(await hasAnotherScript()).toBe(true)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should inject script on hover with prefetching disabled and fetch data', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/prefetch-disabled-ssg')

        async function hasSsgScript() {
          const scripts = await browser.elementsByCss(
            // Mouse hover is a high-priority fetch
            'script:not([async])'
          )
          let scriptFound = false
          for (const aScript of scripts) {
            const href = await aScript.getAttribute('src')
            if (href.includes('basic')) {
              scriptFound = true
              break
            }
          }
          return scriptFound
        }

        await waitFor(2 * 1000)
        expect(await hasSsgScript()).toBe(false)
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        expect(hrefs.map((href) => new URL(href).pathname)).toEqual([])
        await browser.elementByCss('#link-ssg').moveTo()
        await waitFor(2 * 1000)
        expect(await hasSsgScript()).toBe(true)
        const hrefs2 = await browser.eval(`Object.keys(window.next.router.sdc)`)
        expect(hrefs2.map((href) => new URL(href).pathname)).toEqual([
          '/_next/data/test-build/ssg/basic.json',
        ])
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should inject a <script> tag when onMouseEnter (even with invalid ref)', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/invalid-ref')
        await browser.elementByCss('#btn-link').moveTo()
        await waitFor(2 * 1000)

        const scripts = await browser.elementsByCss(
          // Mouse hover is a high-priority fetch
          'script:not([async])'
        )
        let scriptFound = false
        for (const aScript of scripts) {
          const href = await aScript.getAttribute('src')
          if (href.includes('another')) {
            scriptFound = true
            break
          }
        }
        expect(scriptFound).toBe(true)
      } finally {
        if (browser) await browser.close()
      }
    })

    it('should not have unhandledRejection when failing to prefetch on link', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval(`(function() {
      window.addEventListener('unhandledrejection', function (err) {
        window.hadUnhandledReject = true;
      })
      window.next.router.push('/invalid-prefetch');
    })()`)

      expect(await browser.eval('window.hadUnhandledReject')).toBeFalsy()

      await browser.waitForElementByCss('#invalid-link')
      await browser.elementByCss('#invalid-link').moveTo()
      expect(await browser.eval('window.hadUnhandledReject')).toBeFalsy()
    })

    it('should not prefetch when prefetch is explicitly set to false', async () => {
      const browser = await webdriver(appPort, '/opt-out')

      const links = await browser.elementsByCss('link[rel=prefetch]')
      let found = false

      for (const link of links) {
        const href = await link.getAttribute('href')
        if (href.includes('another')) {
          found = true
          break
        }
      }
      expect(found).toBe(false)
    })

    it('should not prefetch already loaded scripts', async () => {
      const browser = await webdriver(appPort, '/')

      const scriptSrcs = await browser.eval(`(function() {
      return Array.from(document.querySelectorAll('script'))
        .map(function(el) {
          return el.src && new URL(el.src).pathname
        }).filter(Boolean)
    })()`)

      await browser.eval('next.router.prefetch("/")')

      const linkHrefs = await browser.eval(`(function() {
      return Array.from(document.querySelectorAll('link'))
        .map(function(el) {
          return el.href && new URL(el.href).pathname
        }).filter(Boolean)
    })()`)

      console.log({ linkHrefs, scriptSrcs })
      expect(scriptSrcs.some((src) => src.includes('pages/index-'))).toBe(true)
      expect(linkHrefs.some((href) => href.includes('pages/index-'))).toBe(
        false
      )
    })

    it('should not duplicate prefetches', async () => {
      const browser = await webdriver(appPort, '/multi-prefetch')

      const links = await browser.elementsByCss('link[rel=prefetch]')

      const hrefs = []
      for (const link of links) {
        const href = await link.getAttribute('href')
        hrefs.push(href)
      }
      hrefs.sort()

      // Ensure no duplicates
      expect(hrefs).toEqual([...new Set(hrefs)])

      // Verify encoding
      expect(hrefs.some((e) => e.includes(`%5Bhello%5D-`))).toBe(true)
    })

    it('should not re-prefetch for an already prefetched page', async () => {
      // info: both `/` and `/de-duped` ref the `/first` page, which we don't
      // want to be re-fetched/re-observed.
      const browser = await webdriver(appPort, '/')

      await check(async () => {
        const links = await browser.elementsByCss('link[rel=prefetch]')
        let found = false

        for (const link of links) {
          const href = await link.getAttribute('href')
          if (href.includes('first')) {
            found = true
            break
          }
        }
        expect(found).toBe(true)
        return 'success'
      }, 'success')

      await browser.eval(`(function() {
      window.calledPrefetch = false
      window.next.router.prefetch = function() {
        window.calledPrefetch = true
        return Promise.resolve()
      }
      window.next.router.push('/de-duped')
    })()`)
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /to \/first/
      )
      const calledPrefetch = await browser.eval(`window.calledPrefetch`)
      expect(calledPrefetch).toBe(false)
    })

    it('should prefetch with a different asPath for a prefetched page', async () => {
      // info: both `/` and `/not-de-duped` ref the `/first` page, which we want
      // to see prefetched twice.
      const browser = await webdriver(appPort, '/')
      await browser.eval(`(function() {
      window.calledPrefetch = false
      window.next.router.prefetch = function() {
        window.calledPrefetch = true
        return Promise.resolve()
      }
      window.next.router.push('/not-de-duped')
    })()`)
      await waitFor(2 * 1000)
      const calledPrefetch = await browser.eval(`window.calledPrefetch`)
      expect(calledPrefetch).toBe(true)
    })

    it('should correctly omit pre-generated dynamic pages from SSG manifest', async () => {
      const content = await readFile(
        join(appDir, '.next', 'static', 'test-build', '_ssgManifest.js'),
        'utf8'
      )

      let self = {}
      // eslint-disable-next-line no-eval
      eval(content)
      expect([...self.__SSG_MANIFEST].sort()).toMatchInlineSnapshot(`
      [
        "/[...rest]",
        "/ssg/basic",
        "/ssg/catch-all/[...slug]",
        "/ssg/dynamic-nested/[slug1]/[slug2]",
        "/ssg/dynamic/[slug]",
        "/ssg/slow",
      ]
    `)
    })

    it('should prefetch data files', async () => {
      const browser = await webdriver(appPort, '/ssg/fixture')
      await waitFor(2 * 1000) // wait for prefetching to occur

      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      hrefs.sort()

      expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
        '/_next/data/test-build/ssg/basic.json',
        '/_next/data/test-build/ssg/catch-all/foo.json',
        '/_next/data/test-build/ssg/catch-all/foo/bar.json',
        '/_next/data/test-build/ssg/catch-all/one.json',
        '/_next/data/test-build/ssg/catch-all/one/two.json',
        '/_next/data/test-build/ssg/dynamic-nested/foo/bar.json',
        '/_next/data/test-build/ssg/dynamic-nested/one/two.json',
        '/_next/data/test-build/ssg/dynamic/one.json',
        '/_next/data/test-build/ssg/dynamic/two.json',
      ])
    })

    it('should prefetch data files when mismatched', async () => {
      const browser = await webdriver(appPort, '/ssg/fixture/mismatch')
      await waitFor(2 * 1000) // wait for prefetching to occur

      const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
      hrefs.sort()

      expect(hrefs.map((href) => new URL(href).pathname)).toEqual([
        '/_next/data/test-build/ssg/catch-all/foo.json',
        '/_next/data/test-build/ssg/catch-all/foo/bar.json',
        '/_next/data/test-build/ssg/catch-all/one.json',
        '/_next/data/test-build/ssg/catch-all/one/two.json',
        '/_next/data/test-build/ssg/dynamic-nested/foo/bar.json',
        '/_next/data/test-build/ssg/dynamic-nested/one/two.json',
        '/_next/data/test-build/ssg/dynamic/one.json',
        '/_next/data/test-build/ssg/dynamic/two.json',
      ])
    })
  })
})
