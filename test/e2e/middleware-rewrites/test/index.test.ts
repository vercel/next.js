/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'

describe('Middleware Rewrite', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
      },
    })
  })

  tests()
  testsWithLocale()
  testsWithLocale('/fr')

  function tests() {
    // TODO: middleware effect headers aren't available here
    it.skip('includes the locale in rewrites by default', async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-me-to-about`)
      expect(
        res.headers.get('x-middleware-rewrite')?.endsWith('/en/about')
      ).toEqual(true)
    })

    it('should rewrite correctly when navigating via history', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#override-with-internal-rewrite').click()
      await check(() => {
        return browser.eval('document.documentElement.innerHTML')
      }, /Welcome Page A/)

      await browser.refresh()
      await browser.back()
      await browser.waitForElementByCss('#override-with-internal-rewrite')
      await browser.forward()
      await check(() => {
        return browser.eval('document.documentElement.innerHTML')
      }, /Welcome Page A/)
    })

    it('should rewrite correctly when navigating via history after query update', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#override-with-internal-rewrite').click()
      await check(() => {
        return browser.eval('document.documentElement.innerHTML')
      }, /Welcome Page A/)

      await browser.refresh()
      await browser.waitForCondition(`!!window.next.router.isReady`)
      await browser.back()
      await browser.waitForElementByCss('#override-with-internal-rewrite')
      await browser.forward()
      await check(() => {
        return browser.eval('document.documentElement.innerHTML')
      }, /Welcome Page A/)
    })

    it('should return HTML/data correctly for pre-rendered page', async () => {
      for (const slug of [
        'first',
        'build-time-1',
        'build-time-2',
        'build-time-3',
      ]) {
        const res = await fetchViaHTTP(next.url, `/fallback-true-blog/${slug}`)
        expect(res.status).toBe(200)

        const $ = cheerio.load(await res.text())
        expect(JSON.parse($('#props').text())?.params).toEqual({
          slug,
        })

        const dataRes = await fetchViaHTTP(
          next.url,
          `/_next/data/${next.buildId}/en/fallback-true-blog/${slug}.json`,
          undefined,
          {
            headers: {
              'x-nextjs-data': '1',
            },
          }
        )
        expect(dataRes.status).toBe(200)
        expect((await dataRes.json())?.pageProps?.params).toEqual({
          slug,
        })
      }
    })

    it('should override with rewrite internally correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/about`,
        { override: 'internal' },
        { redirect: 'manual' }
      )

      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Welcome Page A')

      const browser = await webdriver(next.url, ``)
      await browser.elementByCss('#override-with-internal-rewrite').click()
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Welcome Page A/
      )
      expect(await browser.eval('window.location.pathname')).toBe(`/about`)
      expect(await browser.eval('window.location.search')).toBe(
        '?override=internal'
      )
    })

    it(`should rewrite to data urls for incoming data request internally rewritten`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/es/about.json`,
        { override: 'internal' },
        { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
      )
      const json = await res.json()
      expect(json.pageProps).toEqual({ abtest: true })
    })

    it('should override with rewrite externally correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/about`,
        { override: 'external' },
        { redirect: 'manual' }
      )

      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Example Domain')

      const browser = await webdriver(next.url, ``)
      await browser.elementByCss('#override-with-external-rewrite').click()
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Example Domain/
      )
      await check(() => browser.eval('window.location.pathname'), `/about`)
      await check(
        () => browser.eval('window.location.search'),
        '?override=external'
      )
    })

    it(`should rewrite to the external url for incoming data request externally rewritten`, async () => {
      const browser = await webdriver(
        next.url,
        `/_next/data/${next.buildId}/es/about.json?override=external`,
        undefined
      )
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Example Domain/
      )
    })

    it('should rewrite to fallback: true page successfully', async () => {
      const randomSlug = `another-${Date.now()}`
      const res2 = await fetchViaHTTP(next.url, `/to-blog/${randomSlug}`)
      expect(res2.status).toBe(200)
      expect(await res2.text()).toContain('Loading...')

      const randomSlug2 = `another-${Date.now()}`
      const browser = await webdriver(next.url, `/to-blog/${randomSlug2}`)

      await check(async () => {
        const props = JSON.parse(await browser.elementByCss('#props').text())
        return props.params.slug === randomSlug2
          ? 'success'
          : JSON.stringify(props)
      }, 'success')
    })

    it('should allow to opt-out prefetch caching', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.addCookie({ name: 'about-bypass', value: '1' })
      await browser.refresh()
      await browser.eval('window.__SAME_PAGE = true')
      await browser.elementByCss('#link-with-rewritten-url').click()
      await browser.waitForElementByCss('.refreshed')
      await browser.deleteCookies()
      expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
      const element = await browser.elementByCss('.title')
      expect(await element.text()).toEqual('About Bypassed Page')
    })

    if (!(global as any).isNextDev) {
      it('should cache data requests correctly', async () => {
        const browser = await webdriver(next.url, '/')

        await check(async () => {
          const hrefs = await browser.eval(
            `Object.keys(window.next.router.sdc)`
          )
          for (const url of [
            '/en/about.json?override=external',
            '/en/about.json?override=internal',
            '/en/rewrite-me-external-twice.json',
            '/en/rewrite-me-to-about.json?override=internal',
            '/en/rewrite-me-to-vercel.json',
            '/en/rewrite-to-ab-test.json',
          ]) {
            if (!hrefs.some((href) => href.includes(url))) {
              return JSON.stringify(hrefs, null, 2)
            }
          }
          return 'yes'
        }, 'yes')
      })
    }

    it(`should allow to rewrite keeping the locale in pathname`, async () => {
      const res = await fetchViaHTTP(next.url, '/fr/country', {
        country: 'spain',
      })
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#locale').text()).toBe('fr')
      expect($('#country').text()).toBe('spain')
    })

    it(`should allow to rewrite to a different locale`, async () => {
      const res = await fetchViaHTTP(next.url, '/country', {
        'my-locale': 'es',
      })
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#locale').text()).toBe('es')
      expect($('#country').text()).toBe('us')
    })

    it(`should behave consistently on recursive rewrites`, async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-me-to-about`, {
        override: 'internal',
      })
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('.title').text()).toBe('About Page')

      const browser = await webdriver(next.url, `/`)
      await browser.elementByCss('#rewrite-me-to-about').click()
      await check(
        () => browser.eval(`window.location.pathname`),
        `/rewrite-me-to-about`
      )
      const element = await browser.elementByCss('.title')
      expect(await element.text()).toEqual('About Page')
    })

    it(`should allow to switch locales`, async () => {
      const browser = await webdriver(next.url, '/i18n')
      await browser.waitForElementByCss('.en')
      await browser.elementByCss('#link-ja').click()
      await browser.waitForElementByCss('.ja')
      await browser.elementByCss('#link-en').click()
      await browser.waitForElementByCss('.en')
      await browser.elementByCss('#link-fr').click()
      await browser.waitForElementByCss('.fr')
      await browser.elementByCss('#link-ja2').click()
      await browser.waitForElementByCss('.ja')
      await browser.elementByCss('#link-en2').click()
      await browser.waitForElementByCss('.en')
    })

    it('should allow to rewrite to a `beforeFiles` rewrite config', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/rewrite-to-beforefiles-rewrite`
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Welcome Page A')

      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#rewrite-to-beforefiles-rewrite').click()
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Welcome Page A/
      )
      expect(await browser.eval('window.location.pathname')).toBe(
        `/rewrite-to-beforefiles-rewrite`
      )
    })

    it('should allow to rewrite to a `afterFiles` rewrite config', async () => {
      const res = await fetchViaHTTP(next.url, `/rewrite-to-afterfiles-rewrite`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('Welcome Page B')

      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#rewrite-to-afterfiles-rewrite').click()
      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /Welcome Page B/
      )
      expect(await browser.eval('window.location.pathname')).toBe(
        `/rewrite-to-afterfiles-rewrite`
      )
    })
  }

  function testsWithLocale(locale = '') {
    const label = locale ? `${locale} ` : ``

    it(`${label}should add a cookie and rewrite to a/b test`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/rewrite-to-ab-test`)
      const html = await res.text()
      const $ = cheerio.load(html)
      // Set-Cookie header with Expires should not be split into two
      expect(res.headers.raw()['set-cookie']).toHaveLength(1)
      const bucket = getCookieFromResponse(res, 'bucket')
      const expectedText = bucket === 'a' ? 'Welcome Page A' : 'Welcome Page B'
      const browser = await webdriver(next.url, `${locale}/rewrite-to-ab-test`)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(
          `${locale}/rewrite-to-ab-test`
        )
      } finally {
        await browser.close()
      }
      // -1 is returned if bucket was not found in func getCookieFromResponse
      expect(bucket).not.toBe(-1)
      expect($('.title').text()).toBe(expectedText)
    })

    it(`${label}should clear query parameters`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/clear-query-params`, {
        a: '1',
        b: '2',
        foo: 'bar',
        allowed: 'kept',
      })
      const html = await res.text()
      const $ = cheerio.load(html)
      expect(JSON.parse($('#my-query-params').text())).toEqual({
        allowed: 'kept',
      })
    })

    it(`${label}should rewrite to about page`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/rewrite-me-to-about`)
      const html = await res.text()
      const $ = cheerio.load(html)
      const browser = await webdriver(next.url, `${locale}/rewrite-me-to-about`)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(
          `${locale}/rewrite-me-to-about`
        )
      } finally {
        await browser.close()
      }
      expect($('.title').text()).toBe('About Page')
    })

    it(`${label}support colons in path`, async () => {
      const path = `${locale}/not:param`
      const res = await fetchViaHTTP(next.url, path)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#props').text()).toBe('not:param')
      const browser = await webdriver(next.url, path)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(path)
      } finally {
        await browser.close()
      }
    })

    it(`${label}can rewrite to path with colon`, async () => {
      const path = `${locale}/rewrite-me-with-a-colon`
      const res = await fetchViaHTTP(next.url, path)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#props').text()).toBe('with:colon')
      const browser = await webdriver(next.url, path)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(path)
      } finally {
        await browser.close()
      }
    })

    it(`${label}can rewrite from path with colon`, async () => {
      const path = `${locale}/colon:here`
      const res = await fetchViaHTTP(next.url, path)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#props').text()).toBe('no-colon-here')
      const browser = await webdriver(next.url, path)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(path)
      } finally {
        await browser.close()
      }
    })

    it(`${label}can rewrite from path with colon and retain query parameter`, async () => {
      const path = `${locale}/colon:here?qp=arg`
      const res = await fetchViaHTTP(next.url, path)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#props').text()).toBe('no-colon-here')
      expect($('#qp').text()).toBe('arg')
      const browser = await webdriver(next.url, path)
      try {
        expect(
          await browser.eval(
            `window.location.href.replace(window.location.origin, '')`
          )
        ).toBe(path)
      } finally {
        await browser.close()
      }
    })

    it(`${label}can rewrite to path with colon and retain query parameter`, async () => {
      const path = `${locale}/rewrite-me-with-a-colon?qp=arg`
      const res = await fetchViaHTTP(next.url, path)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#props').text()).toBe('with:colon')
      expect($('#qp').text()).toBe('arg')
      const browser = await webdriver(next.url, path)
      try {
        expect(
          await browser.eval(
            `window.location.href.replace(window.location.origin, '')`
          )
        ).toBe(path)
      } finally {
        await browser.close()
      }
    })

    if (!(global as any).isNextDeploy) {
      it(`${label}should rewrite when not using localhost`, async () => {
        const customUrl = new URL(next.url)
        customUrl.hostname = 'localtest.me'

        const res = await fetchViaHTTP(
          customUrl.toString(),
          `${locale}/rewrite-me-without-hard-navigation`
        )
        const html = await res.text()
        const $ = cheerio.load(html)
        expect($('.title').text()).toBe('About Page')
      })
    }

    it(`${label}should rewrite to Vercel`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/rewrite-me-to-vercel`)
      const html = await res.text()
      // const browser = await webdriver(next.url, '/rewrite-me-to-vercel')
      // TODO: running this to chech the window.location.pathname hangs for some reason;
      expect(html).toContain('Example Domain')
    })

    it(`${label}should rewrite without hard navigation`, async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.__SAME_PAGE = true')
      await browser.elementByCss('#link-with-rewritten-url').click()
      await browser.waitForElementByCss('.refreshed')
      expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
      const element = await browser.elementByCss('.middleware')
      expect(await element.text()).toEqual('foo')
    })

    it(`${label}should not call middleware with shallow push`, async () => {
      const browser = await webdriver(next.url, '')
      await browser.elementByCss('#link-to-shallow-push').click()
      await browser.waitForCondition(
        'new URL(window.location.href).searchParams.get("path") === "rewrite-me-without-hard-navigation"'
      )
      await expect(async () => {
        await browser.waitForElementByCss('.refreshed', 500)
      }).rejects.toThrow()
    })

    it(`${label}should correctly rewriting to a different dynamic path`, async () => {
      const browser = await webdriver(next.url, '/dynamic-replace')
      const element = await browser.elementByCss('.title')
      expect(await element.text()).toEqual('Parts page')
      const logs = await browser.log()
      expect(
        logs.every((log) => log.source === 'log' || log.source === 'info')
      ).toEqual(true)
    })
  }

  function getCookieFromResponse(res, cookieName) {
    // node-fetch bundles the cookies as string in the Response
    const cookieArray = res.headers.raw()['set-cookie']
    for (const cookie of cookieArray) {
      let individualCookieParams = cookie.split(';')
      let individualCookie = individualCookieParams[0].split('=')
      if (individualCookie[0] === cookieName) {
        return individualCookie[1]
      }
    }
    return -1
  }
})
