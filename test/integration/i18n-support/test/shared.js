/* eslint-env jest */

import url from 'url'
import fs from 'fs-extra'
import cheerio from 'cheerio'
import { join } from 'path'
import webdriver from 'next-webdriver'
import escapeRegex from 'escape-string-regexp'
import assert from 'assert'
import {
  fetchViaHTTP,
  renderViaHTTP,
  waitFor,
  normalizeRegEx,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const domainLocales = ['go', 'go-BE', 'do', 'do-BE']
export const nonDomainLocales = [
  'en-US',
  'nl-NL',
  'nl-BE',
  'nl',
  'fr-BE',
  'fr',
  'en',
]
export const locales = [...nonDomainLocales, ...domainLocales]

async function addDefaultLocaleCookie(browser) {
  // make sure default locale is used in case browser isn't set to
  // favor en-US by default, (we use all caps to ensure it's case-insensitive)
  await browser.manage().addCookie({ name: 'NEXT_LOCALE', value: 'EN-US' })
  await browser.get(browser.initUrl)
}

export function runTests(ctx) {
  it('should not error with similar named cookie to locale cookie', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      ctx.basePath || '/',
      undefined,
      {
        headers: {
          cookie: 'NEXT_LOCALE2=hello',
        },
      }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('index page')
  })

  it('should not add duplicate locale key when navigating back to root path with query params', async () => {
    const basePath = ctx.basePath || ''
    const queryKey = 'query'
    const queryValue = '1'
    const browser = await webdriver(
      ctx.appPort,
      `${basePath}/fr?${queryKey}=${queryValue}`
    )

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ [queryKey]: queryValue })
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr/another`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser.back().waitForElementByCss('#index')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ [queryKey]: queryValue })
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
  })

  it('should not add duplicate locale key when navigating back to root path with hash', async () => {
    const basePath = ctx.basePath || ''
    const hashValue = '#anchor-1'
    const browser = await webdriver(ctx.appPort, `${basePath}/fr${hashValue}`)

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr`
    )
    expect(await browser.eval(() => document.location.hash)).toBe(hashValue)
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr/another`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser.back().waitForElementByCss('#index')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${basePath}/fr`
    )
    expect(await browser.eval(() => document.location.hash)).toBe(hashValue)
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
  })

  it('should handle navigating back to different casing of locale', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath || ''}/FR/links`
    )

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${ctx.basePath || ''}/FR/links`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${ctx.basePath || ''}/fr/another`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')

    await browser.back().waitForElementByCss('#links')

    expect(await browser.eval(() => document.location.pathname)).toBe(
      `${ctx.basePath || ''}/FR/links`
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
  })

  it('should have correct initial query values for fallback', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/gsp/fallback/random-' + Date.now()}`
    )

    const html = await res.text()
    const $ = cheerio.load(html)

    expect(JSON.parse($('#router-query').text())).toEqual({})
  })

  it('should navigate to page with same name as development buildId', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath || '/'}`)

    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/developments')
    })()`)

    await browser.waitForElementByCss('#developments')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/developments'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/developments'
    )
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locales,
      locale: 'en-US',
      defaultLocale: 'en-US',
    })
  })

  // this test can not currently be tested in browser without modifying the
  // host resolution since it needs a domain to test locale domains behavior
  it.skip('should redirect to locale domain correctly client-side', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath || '/'}`)

    await browser.eval(`(function() {
      window.next.router.push(
        window.next.router.pathname,
        window.next.router.asPath,
        {
          locale: 'go'
        }
      )
    })()`)

    await check(() => browser.eval('window.location.hostname'), /example\.com/)
    expect(await browser.eval('window.location.pathname')).toBe(
      ctx.basePath || '/'
    )

    await browser.get(browser.initUrl)
    await browser.waitForElementByCss('#index')

    await browser.eval(`(function() {
      window.next.router.push(
        '/gssp',
        undefined,
        {
          locale: 'go-BE'
        }
      )
    })()`)

    await check(() => browser.eval('window.location.hostname'), /example\.com/)
    expect(await browser.eval('window.location.pathname')).toBe(
      `${ctx.basePath || ''}/go-BE/gssp`
    )
  })

  // this test can not currently be tested in browser without modifying the
  // host resolution since it needs a domain to test locale domains behavior
  it.skip('should render the correct href for locale domain', async () => {
    let browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath || ''}/links?nextLocale=go`
    )

    for (const [element, pathname] of [
      ['#to-another', '/another'],
      ['#to-gsp', '/gsp'],
      ['#to-fallback-first', '/gsp/fallback/first'],
      ['#to-fallback-hello', '/gsp/fallback/hello'],
      ['#to-gssp', '/gssp'],
      ['#to-gssp-slug', '/gssp/first'],
    ]) {
      const href = await browser.elementByCss(element).getAttribute('href')
      expect(href).toBe(`https://example.com${ctx.basePath || ''}${pathname}`)
    }

    browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath || ''}/links?nextLocale=go-BE`
    )

    for (const [element, pathname] of [
      ['#to-another', '/another'],
      ['#to-gsp', '/gsp'],
      ['#to-fallback-first', '/gsp/fallback/first'],
      ['#to-fallback-hello', '/gsp/fallback/hello'],
      ['#to-gssp', '/gssp'],
      ['#to-gssp-slug', '/gssp/first'],
    ]) {
      const href = await browser.elementByCss(element).getAttribute('href')
      expect(href).toBe(
        `https://example.com${ctx.basePath || ''}/go-BE${pathname}`
      )
    }
  })

  it('should render the correct href with locale domains but not on a locale domain', async () => {
    let browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath || ''}/links?nextLocale=go`
    )

    for (const [element, pathname] of [
      ['#to-another', '/another'],
      ['#to-gsp', '/gsp'],
      ['#to-fallback-first', '/gsp/fallback/first'],
      ['#to-fallback-hello', '/gsp/fallback/hello'],
      ['#to-gssp', '/gssp'],
      ['#to-gssp-slug', '/gssp/first'],
    ]) {
      const href = await browser.elementByCss(element).getAttribute('href')
      const { hostname, pathname: hrefPathname } = url.parse(href)
      expect(hostname).not.toBe('example.com')
      expect(hrefPathname).toBe(`${ctx.basePath || ''}/go${pathname}`)
    }

    browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath || ''}/links?nextLocale=go-BE`
    )

    for (const [element, pathname] of [
      ['#to-another', '/another'],
      ['#to-gsp', '/gsp'],
      ['#to-fallback-first', '/gsp/fallback/first'],
      ['#to-fallback-hello', '/gsp/fallback/hello'],
      ['#to-gssp', '/gssp'],
      ['#to-gssp-slug', '/gssp/first'],
    ]) {
      const href = await browser.elementByCss(element).getAttribute('href')
      const { hostname, pathname: hrefPathname } = url.parse(href)
      expect(hostname).not.toBe('example.com')
      expect(hrefPathname).toBe(`${ctx.basePath || ''}/go-BE${pathname}`)
    }
  })

  it('should navigate through history with query correctly', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath || '/'}`)

    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push(
        window.next.router.pathname,
        window.next.router.asPath,
        { locale: 'nl' }
      )
    })()`)

    await check(() => browser.elementByCss('#router-locale').text(), 'nl')
    expect(await browser.eval('window.beforeNav')).toBe(1)

    await browser.eval(`(function() {
      window.next.router.push(
        '/gssp?page=1'
      )
    })()`)

    await check(async () => {
      const html = await browser.eval('document.documentElement.innerHTML')
      const props = JSON.parse(cheerio.load(html)('#props').text())

      assert.deepEqual(props, {
        locale: 'nl',
        locales,
        defaultLocale: 'en-US',
        query: { page: '1' },
      })
      return 'success'
    }, 'success')

    await browser
      .back()
      .waitForElementByCss('#index')
      .forward()
      .waitForElementByCss('#gssp')

    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props2).toEqual({
      locale: 'nl',
      locales,
      defaultLocale: 'en-US',
      query: { page: '1' },
    })
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  if (!ctx.isDev) {
    it('should not contain backslashes in pages-manifest', async () => {
      const pagesManifestContent = await fs.readFile(
        join(ctx.buildPagesDir, '../pages-manifest.json'),
        'utf8'
      )
      expect(pagesManifestContent).not.toContain('\\')
      expect(pagesManifestContent).toContain('/')
    })
  }

  it('should resolve href correctly when dynamic route matches locale prefixed', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/nl`)
    await browser.eval('window.beforeNav = 1')

    await browser.eval(`(function() {
      window.next.router.push('/post-1?a=b')
    })()`)
    await browser.waitForElementByCss('#post')

    const router = JSON.parse(await browser.elementByCss('#router').text())
    expect(router.query).toEqual({ post: 'post-1', a: 'b' })
    expect(router.pathname).toBe('/[post]')
    expect(router.asPath).toBe('/post-1?a=b')
    expect(router.locale).toBe('nl')

    await browser.back().waitForElementByCss('#index')
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
  })

  it('should use default locale when no locale is in href with locale false', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/nl/locale-false?nextLocale=fr`
    )

    await browser.eval('window.beforeNav = 1')

    if (!ctx.isDev) {
      await browser.eval(`(function() {
        document.querySelector('#to-gssp-slug-default').scrollIntoView()
        document.querySelector('#to-gsp-default').scrollIntoView()
      })()`)

      await check(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname
              .replace(ctx.basePath, '')
              .replace(/^\/_next\/data\/[^/]+/, '')
          ),
          [
            '/en-US/gsp.json',
            '/fr/gsp.json',
            '/fr/gsp/fallback/first.json',
            '/fr/gsp/fallback/hello.json',
          ]
        )
        return 'yes'
      }, 'yes')
    }

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  if (ctx.isDev) {
    it('should show error for redirect and notFound returned at same time', async () => {
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/_next/data/development/en/gsp/fallback/mixed-not-found-redirect.json`
      )

      expect(html).toContain(
        '`redirect` and `notFound` can not both be returned from getStaticProps at the same time. Page: /gsp/fallback/[slug]'
      )
    })
  } else {
    it('should preload all locales data correctly', async () => {
      const browser = await webdriver(ctx.appPort, `${ctx.basePath}/mixed`)

      await browser.eval(`(function() {
        document.querySelector('#to-gsp-en-us').scrollIntoView()
        document.querySelector('#to-gsp-nl-nl').scrollIntoView()
        document.querySelector('#to-gsp-fr').scrollIntoView()
      })()`)

      await check(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname
              .replace(ctx.basePath, '')
              .replace(/^\/_next\/data\/[^/]+/, '')
          ),
          ['/en-US/gsp.json', '/fr.json', '/fr/gsp.json', '/nl-NL/gsp.json']
        )
        return 'yes'
      }, 'yes')
    })
  }

  it('should have correct values for non-prefixed path', async () => {
    for (const paths of [
      ['/links', '/links'],
      ['/another', '/another'],
      ['/gsp/fallback/first', '/gsp/fallback/[slug]'],
      ['/gsp/no-fallback/first', '/gsp/no-fallback/[slug]'],
    ]) {
      const [asPath, pathname] = paths

      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}${asPath}`,
        undefined,
        {
          redirect: 'manual',
          headers: {
            'accept-language': 'fr',
          },
        }
      )

      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('html').attr('lang')).toBe('en-US')
      expect($('#router-locale').text()).toBe('en-US')
      expect($('#router-default-locale').text()).toBe('en-US')
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect($('#router-pathname').text()).toBe(pathname)
      expect($('#router-as-path').text()).toBe(asPath)
    }
  })

  it('should not have hydration mis-match from hash', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/en#`)

    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  if (!ctx.isDev) {
    it('should add i18n config to routes-manifest', async () => {
      const routesManifest = await fs.readJSON(
        join(ctx.appDir, '.next/routes-manifest.json')
      )

      expect(routesManifest.i18n).toEqual({
        locales,
        defaultLocale: 'en-US',
        domains: [
          {
            http: true,
            domain: 'example.do',
            defaultLocale: 'do',
            locales: ['do-BE'],
          },
          {
            domain: 'example.com',
            defaultLocale: 'go',
            locales: ['go-BE'],
          },
        ],
      })
    })

    it('should output correct prerender-manifest', async () => {
      const prerenderManifest = await fs.readJSON(
        join(ctx.appDir, '.next/prerender-manifest.json')
      )
      const staticRoutes = {}
      const dynamicRoutes = {}

      for (const key of Object.keys(prerenderManifest.routes).sort()) {
        const item = prerenderManifest.routes[key]
        staticRoutes[key] = item
      }

      for (const key of Object.keys(prerenderManifest.dynamicRoutes).sort()) {
        const item = prerenderManifest.dynamicRoutes[key]
        item.routeRegex = normalizeRegEx(item.routeRegex)
        item.dataRouteRegex = normalizeRegEx(item.dataRouteRegex)
        dynamicRoutes[key] = item
      }

      expect(
        JSON.stringify(staticRoutes, null, 2)
          .replace(/\\\\/g, '\\')
          .replace(new RegExp(escapeRegex(ctx.buildId), 'g'), 'BUILD_ID')
      ).toMatchInlineSnapshot(`
        "{
          \\"/do\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/do-BE\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/do-BE/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/do-BE/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/do-BE/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/do-BE/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/do-BE/gsp/fallback/always.json\\"
          },
          \\"/do-BE/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/do/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/do/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/do/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/do/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/do/gsp/fallback/always.json\\"
          },
          \\"/do/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/en\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/en-US\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/en-US/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/en-US/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/en-US/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/en-US/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/gsp/fallback/always.json\\"
          },
          \\"/en-US/gsp/fallback/first\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/gsp/fallback/first.json\\"
          },
          \\"/en-US/gsp/fallback/second\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/gsp/fallback/second.json\\"
          },
          \\"/en-US/gsp/no-fallback/first\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/no-fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/gsp/no-fallback/first.json\\"
          },
          \\"/en-US/gsp/no-fallback/second\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/no-fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/gsp/no-fallback/second.json\\"
          },
          \\"/en-US/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/en-US/not-found/blocking-fallback/first\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/not-found/blocking-fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/not-found/blocking-fallback/first.json\\"
          },
          \\"/en-US/not-found/blocking-fallback/second\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/not-found/blocking-fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/not-found/blocking-fallback/second.json\\"
          },
          \\"/en-US/not-found/fallback/first\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/not-found/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/not-found/fallback/first.json\\"
          },
          \\"/en-US/not-found/fallback/second\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/not-found/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en-US/not-found/fallback/second.json\\"
          },
          \\"/en/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/en/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/en/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/en/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/en/gsp/fallback/always.json\\"
          },
          \\"/fr\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/fr-BE\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/fr-BE/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/fr-BE/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/fr-BE/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/fr-BE/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/fr-BE/gsp/fallback/always.json\\"
          },
          \\"/fr-BE/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/fr/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/fr/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/fr/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/fr/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/fr/gsp/fallback/always.json\\"
          },
          \\"/fr/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/go\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/go-BE\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/go-BE/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/go-BE/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/go-BE/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/go-BE/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/go-BE/gsp/fallback/always.json\\"
          },
          \\"/go-BE/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/go/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/go/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/go/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/go/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/go/gsp/fallback/always.json\\"
          },
          \\"/go/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/nl\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/nl-BE\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/nl-BE/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/nl-BE/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/nl-BE/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/nl-BE/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/nl-BE/gsp/fallback/always.json\\"
          },
          \\"/nl-BE/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/nl-NL\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/index.json\\"
          },
          \\"/nl-NL/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/nl-NL/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/nl-NL/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/nl-NL/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/nl-NL/gsp/fallback/always.json\\"
          },
          \\"/nl-NL/gsp/no-fallback/second\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/no-fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/nl-NL/gsp/no-fallback/second.json\\"
          },
          \\"/nl-NL/not-found\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found.json\\"
          },
          \\"/nl/404\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/404.json\\"
          },
          \\"/nl/frank\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/frank.json\\"
          },
          \\"/nl/gsp\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": null,
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp.json\\"
          },
          \\"/nl/gsp/fallback/always\\": {
            \\"initialRevalidateSeconds\\": false,
            \\"srcRoute\\": \\"/gsp/fallback/[slug]\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/nl/gsp/fallback/always.json\\"
          }
        }"
      `)

      expect(
        JSON.stringify(dynamicRoutes, null, 2)
          .replace(/\\\\/g, '\\')
          .replace(new RegExp(escapeRegex(ctx.buildId), 'g'), 'BUILD_ID')
          .replace(
            new RegExp(escapeRegex(escapeRegex(ctx.buildId)), 'g'),
            'BUILD_ID'
          )
      ).toMatchInlineSnapshot(`
        "{
          \\"/gsp/fallback/[slug]\\": {
            \\"routeRegex\\": \\"^\\\\/gsp\\\\/fallback\\\\/([^\\\\/]+?)(?:\\\\/)?$\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp/fallback/[slug].json\\",
            \\"fallback\\": \\"/gsp/fallback/[slug].html\\",
            \\"dataRouteRegex\\": \\"^\\\\/_next\\\\/data\\\\/BUILD_ID\\\\/gsp\\\\/fallback\\\\/([^\\\\/]+?)\\\\.json$\\"
          },
          \\"/gsp/no-fallback/[slug]\\": {
            \\"routeRegex\\": \\"^\\\\/gsp\\\\/no\\\\-fallback\\\\/([^\\\\/]+?)(?:\\\\/)?$\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/gsp/no-fallback/[slug].json\\",
            \\"fallback\\": false,
            \\"dataRouteRegex\\": \\"^\\\\/_next\\\\/data\\\\/BUILD_ID\\\\/gsp\\\\/no\\\\-fallback\\\\/([^\\\\/]+?)\\\\.json$\\"
          },
          \\"/not-found/blocking-fallback/[slug]\\": {
            \\"routeRegex\\": \\"^\\\\/not\\\\-found\\\\/blocking\\\\-fallback\\\\/([^\\\\/]+?)(?:\\\\/)?$\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found/blocking-fallback/[slug].json\\",
            \\"fallback\\": null,
            \\"dataRouteRegex\\": \\"^\\\\/_next\\\\/data\\\\/BUILD_ID\\\\/not\\\\-found\\\\/blocking\\\\-fallback\\\\/([^\\\\/]+?)\\\\.json$\\"
          },
          \\"/not-found/fallback/[slug]\\": {
            \\"routeRegex\\": \\"^\\\\/not\\\\-found\\\\/fallback\\\\/([^\\\\/]+?)(?:\\\\/)?$\\",
            \\"dataRoute\\": \\"/_next/data/BUILD_ID/not-found/fallback/[slug].json\\",
            \\"fallback\\": \\"/not-found/fallback/[slug].html\\",
            \\"dataRouteRegex\\": \\"^\\\\/_next\\\\/data\\\\/BUILD_ID\\\\/not\\\\-found\\\\/fallback\\\\/([^\\\\/]+?)\\\\.json$\\"
          }
        }"
      `)
    })
  }

  it('should resolve auto-export dynamic route correctly', async () => {
    for (const locale of nonDomainLocales) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/dynamic/first`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('dynamic page')
    }
  })

  it('should navigate to auto-export dynamic page', async () => {
    for (const locale of nonDomainLocales) {
      const browser = await webdriver(ctx.appPort, `${ctx.basePath}/${locale}`)
      await browser.eval('window.beforeNav = 1')

      await browser
        .elementByCss('#to-dynamic')
        .click()
        .waitForElementByCss('#dynamic')

      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
      expect(
        JSON.parse(await browser.elementByCss('#router-locales').text())
      ).toEqual(locales)
      expect(
        JSON.parse(await browser.elementByCss('#router-query').text())
      ).toEqual({ slug: 'first' })
      expect(await browser.elementByCss('#router-pathname').text()).toBe(
        '/dynamic/[slug]'
      )
      expect(await browser.elementByCss('#router-as-path').text()).toBe(
        '/dynamic/first'
      )
      expect(await browser.eval('window.location.pathname')).toBe(
        `${
          locale === 'en-US' ? `${ctx.basePath}` : `${ctx.basePath}/${locale}`
        }/dynamic/first`
      )

      await browser.back().waitForElementByCss('#index')

      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
      expect(
        JSON.parse(await browser.elementByCss('#router-locales').text())
      ).toEqual(locales)
      expect(
        JSON.parse(await browser.elementByCss('#router-query').text())
      ).toEqual({})
      expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    }
  })

  it('should apply trailingSlash redirect correctly', async () => {
    for (const [testPath, path, hostname, query] of [
      ['/first/', '/first', 'localhost', {}],
      ['/en/', '/en', 'localhost', {}],
      ['/en/another/', '/en/another', 'localhost', {}],
      ['/fr/', '/fr', 'localhost', {}],
      ['/fr/another/', '/fr/another', 'localhost', {}],
    ]) {
      const res = await fetchViaHTTP(ctx.appPort, testPath, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(308)

      const parsed = url.parse(res.headers.get('location'), true)
      expect(parsed.pathname).toBe(path)
      expect(parsed.hostname).toBe(hostname)
      expect(parsed.query).toEqual(query)
    }
  })

  it('should apply redirects correctly', async () => {
    for (const [path, shouldRedirect, locale, pathname] of [
      ['/en-US/redirect-1', true],
      ['/en/redirect-1', false],
      ['/nl/redirect-2', true],
      ['/fr/redirect-2', false],
      ['/redirect-3', true],
      ['/en/redirect-3', true, '/en'],
      ['/nl-NL/redirect-3', true, '/nl-NL'],
      ['/redirect-4', true, null, '/'],
      ['/nl/redirect-4', true, null, '/nl'],
    ]) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}${path}`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(shouldRedirect ? 307 : 200)

      if (shouldRedirect) {
        const parsed = url.parse(res.headers.get('location'), true)
        expect(parsed.pathname).toBe(
          `${ctx.basePath}${locale || ''}${pathname || '/somewhere-else'}`
        )
        expect(parsed.query).toEqual({})
      }
    }
  })

  it('should apply headers correctly', async () => {
    for (const [path, shouldAdd] of [
      ['/en-US/add-header-1', true],
      ['/en/add-header-1', false],
      ['/nl/add-header-2', true],
      ['/fr/add-header-2', false],
      ['/add-header-3', true],
      ['/en/add-header-3', true],
      ['/nl-NL/add-header-3', true],
    ]) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}${path}`,
        undefined,
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('x-hello')).toBe(shouldAdd ? 'world' : null)
    }
  })

  it('should visit API route directly correctly', async () => {
    for (const locale of locales) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || ''}${
          locale === 'en-US' ? '' : `/${locale}`
        }/api/hello`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      const data = await res.json()
      expect(data).toEqual({
        hello: true,
        query: {},
      })
    }
  })

  it('should visit dynamic API route directly correctly', async () => {
    for (const locale of locales) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || ''}${
          locale === 'en-US' ? '' : `/${locale}`
        }/api/post/first`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      const data = await res.json()
      expect(data).toEqual({
        post: true,
        query: {
          slug: 'first',
        },
      })
    }
  })

  it('should rewrite to API route correctly', async () => {
    for (const locale of locales) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || ''}${
          locale === 'en-US' ? '' : `/${locale}`
        }/sitemap.xml`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      const data = await res.json()
      expect(data).toEqual({
        hello: true,
        query: {},
      })
    }
  })

  it('should apply rewrites correctly', async () => {
    let res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/en-US/rewrite-1`,
      undefined,
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(200)

    let html = await res.text()
    let $ = cheerio.load(html)
    expect($('html').attr('lang')).toBe('en-US')
    expect($('#router-locale').text()).toBe('en-US')
    expect($('#router-pathname').text()).toBe('/another')
    expect($('#router-as-path').text()).toBe('/rewrite-1')

    res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/nl/rewrite-2`,
      undefined,
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(200)

    html = await res.text()
    $ = cheerio.load(html)
    expect($('html').attr('lang')).toBe('nl')
    expect($('#router-locale').text()).toBe('nl')
    expect($('#router-pathname').text()).toBe('/another')
    expect($('#router-as-path').text()).toBe('/rewrite-2')

    res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/fr/rewrite-3`,
      undefined,
      {
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(200)

    html = await res.text()
    $ = cheerio.load(html)
    expect($('html').attr('lang')).toBe('nl')
    expect($('#router-locale').text()).toBe('nl')
    expect($('#router-pathname').text()).toBe('/another')
    expect($('#router-as-path').text()).toBe('/rewrite-3')

    for (const locale of nonDomainLocales) {
      res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/rewrite-4`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(200)

      html = await res.text()
      $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#router-locale').text()).toBe(locale)
      expect($('#router-pathname').text()).toBe('/another')
      expect($('#router-as-path').text()).toBe('/rewrite-4')

      res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/rewrite-5`,
        undefined,
        {
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.url).toBe('/')
      expect(json.external).toBe(true)
    }
  })

  it('should navigate with locale prop correctly', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/links?nextLocale=fr`
    )
    await addDefaultLocaleCookie(browser)
    await browser.eval('window.beforeNav = 1')

    if (!ctx.isDev) {
      await browser.eval(`(function() {
        document.querySelector('#to-gsp').scrollIntoView()
        document.querySelector('#to-fallback-first').scrollIntoView()
        document.querySelector('#to-no-fallback-first').scrollIntoView()
      })()`)

      await check(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname
              .replace(ctx.basePath, '')
              .replace(/^\/_next\/data\/[^/]+/, '')
          ),
          [
            '/fr/gsp.json',
            '/fr/gsp/fallback/first.json',
            '/fr/gsp/fallback/hello.json',
          ]
        )
        return 'yes'
      }, 'yes')
    }

    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/links?nextLocale=fr'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'fr' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#another')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('fr')

    let parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/fr/another`)
    expect(parsedUrl.query).toEqual({})

    await browser.eval('window.history.back()')
    await browser.waitForElementByCss('#links')

    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/links?nextLocale=fr'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'fr' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/links`)
    expect(parsedUrl.query).toEqual({ nextLocale: 'fr' })

    await browser.eval('window.history.forward()')
    await browser.waitForElementByCss('#another')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('fr')

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/fr/another`)
    expect(parsedUrl.query).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should navigate with locale prop correctly GSP', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/links?nextLocale=nl`
    )
    await addDefaultLocaleCookie(browser)
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/links?nextLocale=nl'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'nl' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    await browser.elementByCss('#to-fallback-first').click()
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/gsp/fallback/[slug]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/gsp/fallback/first'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ slug: 'first' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('nl')

    let parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/nl/gsp/fallback/first`)
    expect(parsedUrl.query).toEqual({})

    await browser.eval('window.history.back()')
    await browser.waitForElementByCss('#links')

    expect(await browser.elementByCss('#router-pathname').text()).toBe('/links')
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/links?nextLocale=nl'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'nl' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/links`)
    expect(parsedUrl.query).toEqual({ nextLocale: 'nl' })

    await browser.eval('window.history.forward()')
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/gsp/fallback/[slug]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/gsp/fallback/first'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ slug: 'first' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('nl')

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/nl/gsp/fallback/first`)
    expect(parsedUrl.query).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should navigate with locale false correctly', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/locale-false?nextLocale=fr`
    )
    await addDefaultLocaleCookie(browser)
    await browser.eval('window.beforeNav = 1')

    if (!ctx.isDev) {
      await browser.eval(`(function() {
        document.querySelector('#to-gsp').scrollIntoView()
        document.querySelector('#to-fallback-first').scrollIntoView()
        document.querySelector('#to-no-fallback-first').scrollIntoView()
      })()`)

      await check(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname
              .replace(ctx.basePath, '')
              .replace(/^\/_next\/data\/[^/]+/, '')
          ),
          [
            '/en-US/gsp.json',
            '/fr/gsp.json',
            '/fr/gsp/fallback/first.json',
            '/fr/gsp/fallback/hello.json',
          ]
        )
        return 'yes'
      }, 'yes')
    }

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/locale-false'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/locale-false?nextLocale=fr'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'fr' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#another')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('fr')

    let parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/fr/another`)
    expect(parsedUrl.query).toEqual({})

    await browser.eval('window.history.back()')
    await browser.waitForElementByCss('#links')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/locale-false'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/locale-false?nextLocale=fr'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'fr' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/locale-false`)
    expect(parsedUrl.query).toEqual({ nextLocale: 'fr' })

    await browser.eval('window.history.forward()')
    await browser.waitForElementByCss('#another')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('fr')

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/fr/another`)
    expect(parsedUrl.query).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should navigate with locale false correctly GSP', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/locale-false?nextLocale=nl`
    )
    await addDefaultLocaleCookie(browser)
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/locale-false'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/locale-false?nextLocale=nl'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'nl' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    await browser.elementByCss('#to-fallback-first').click()
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/gsp/fallback/[slug]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/gsp/fallback/first'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ slug: 'first' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('nl')

    let parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/nl/gsp/fallback/first`)
    expect(parsedUrl.query).toEqual({})

    await browser.eval('window.history.back()')
    await browser.waitForElementByCss('#links')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/locale-false'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/locale-false?nextLocale=nl'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ nextLocale: 'nl' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/locale-false`)
    expect(parsedUrl.query).toEqual({ nextLocale: 'nl' })

    await browser.eval('window.history.forward()')
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/gsp/fallback/[slug]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/gsp/fallback/first'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({ slug: 'first' })
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('nl')

    parsedUrl = url.parse(await browser.eval('window.location.href'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/nl/gsp/fallback/first`)
    expect(parsedUrl.query).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(await browser.eval('window.caughtWarns')).toEqual([])
  })

  it('should update asPath on the client correctly', async () => {
    for (const check of ['en', 'En']) {
      const browser = await webdriver(ctx.appPort, `${ctx.basePath}/${check}`)

      expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
      expect(await browser.elementByCss('#router-locale').text()).toBe('en')
      expect(
        JSON.parse(await browser.elementByCss('#router-locales').text())
      ).toEqual(locales)
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
      expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    }
  })

  if (!ctx.isDev) {
    it('should handle fallback correctly after generating', async () => {
      const browser = await webdriver(
        ctx.appPort,
        `${ctx.basePath}/en/gsp/fallback/hello-fallback`
      )

      // wait for the fallback to be generated/stored to ISR cache
      browser.waitForElementByCss('#gsp')

      // now make sure we're serving the previously generated file from the cache
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/en/gsp/fallback/hello-fallback`
      )
      const $ = cheerio.load(html)

      expect($('#gsp').text()).toBe('gsp page')
      expect($('#router-locale').text()).toBe('en')
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect($('#router-pathname').text()).toBe('/gsp/fallback/[slug]')
      expect($('#router-as-path').text()).toBe('/gsp/fallback/hello-fallback')
    })
  }

  it('should use correct default locale for locale domains', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      undefined,
      {
        headers: {
          host: 'example.do',
        },
      }
    )

    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('html').attr('lang')).toBe('do')
    expect($('#router-locale').text()).toBe('do')
    expect($('#router-as-path').text()).toBe('/')
    expect($('#router-pathname').text()).toBe('/')
    // expect(JSON.parse($('#router-locales').text())).toEqual(['fr','fr-BE'])
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)

    const res2 = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      undefined,
      {
        headers: {
          host: 'example.com',
        },
      }
    )

    expect(res2.status).toBe(200)

    const html2 = await res2.text()
    const $2 = cheerio.load(html2)

    expect($2('html').attr('lang')).toBe('go')
    expect($2('#router-locale').text()).toBe('go')
    expect($2('#router-as-path').text()).toBe('/')
    expect($2('#router-pathname').text()).toBe('/')
    // expect(JSON.parse($2('#router-locales').text())).toEqual(['nl-BE','fr-BE'])
    expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
  })

  it('should not strip locale prefix for default locale with locale domains', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/do`,
      undefined,
      {
        headers: {
          host: 'example.do',
        },
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(200)

    // const result = url.parse(res.headers.get('location'), true)
    // expect(result.pathname).toBe('/')
    // expect(result.query).toEqual({})

    const res2 = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/go`,
      undefined,
      {
        headers: {
          host: 'example.com',
        },
        redirect: 'manual',
      }
    )

    expect(res2.status).toBe(200)

    // const result2 = url.parse(res2.headers.get('location'), true)
    // expect(result2.pathname).toBe('/')
    // expect(result2.query).toEqual({})
  })

  // ('should set locale cookie when removing default locale and accept-lang doesnt match', async () => {
  //   const res = await fetchViaHTTP(ctx.appPort, '/en-US', undefined, {
  //     headers: {
  //       'accept-language': 'nl',
  //     },
  //     redirect: 'manual',
  //   })

  //   expect(res.status).toBe(307)

  //   const parsedUrl = url.parse(res.headers.get('location'), true)
  //   expect(parsedUrl.pathname).toBe('/')
  //   expect(parsedUrl.query).toEqual({})
  //   expect(res.headers.get('set-cookie')).toContain('NEXT_LOCALE=en-US')
  // })

  it('should not redirect to accept-lang preferred locale with locale cookie', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      undefined,
      {
        headers: {
          'accept-language': 'nl',
          cookie: 'NEXT_LOCALE=en-US',
        },
        redirect: 'manual',
      }
    )

    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('en-US')
    expect($('#router-pathname').text()).toBe('/')
    expect($('#router-as-path').text()).toBe('/')
  })

  it('should redirect to correct locale domain', async () => {
    const checks = [
      // test domain, locale prefix, redirect result
      // ['example.be', 'nl-BE', 'http://example.be/'],
      ['example.com', 'do', 'http://example.do/'],
      ['example.do', 'go', 'https://example.com/'],
      // ['example.fr', 'fr', 'http://example.fr/'],
    ]

    for (const check of checks) {
      const [domain, locale, location] = check

      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || '/'}`,
        undefined,
        {
          headers: {
            host: domain,
            'accept-language': locale,
          },
          redirect: 'manual',
        }
      )

      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe(location)
    }
  })

  it('should handle locales with domain', async () => {
    const domainItems = [
      {
        // used for testing, this should not be needed in most cases
        // as production domains should always use https
        http: true,
        domain: 'example.do',
        defaultLocale: 'do',
        locales: ['do-BE'],
      },
      {
        domain: 'example.com',
        defaultLocale: 'go',
        locales: ['go-BE'],
      },
    ]
    const domainLocales = domainItems.reduce((prev, cur) => {
      return [...prev, ...cur.locales]
    }, [])

    const checkDomainLocales = async (
      domainDefault = '',
      domain = '',
      locale = ''
    ) => {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || '/'}`,
        undefined,
        {
          headers: {
            host: domain,
            'accept-language': locale,
          },
          redirect: 'manual',
        }
      )
      const expectedDomainItem = domainItems.find(
        (item) => item.defaultLocale === locale || item.locales.includes(locale)
      )
      const shouldRedirect =
        expectedDomainItem.domain !== domain ||
        locale !== expectedDomainItem.defaultLocale

      console.log('checking', {
        domain,
        locale,
        shouldRedirect,
        expectedDomainItem,
        status: res.status,
      })

      expect(res.status).toBe(shouldRedirect ? 307 : 200)

      if (shouldRedirect) {
        const parsedUrl = url.parse(res.headers.get('location'), true)

        expect(parsedUrl.pathname).toBe(
          `/${expectedDomainItem.defaultLocale === locale ? '' : locale}`
        )
        expect(parsedUrl.query).toEqual({})
        expect(parsedUrl.hostname).toBe(expectedDomainItem.domain)
      } else {
        const html = await res.text()
        const $ = cheerio.load(html)

        expect($('html').attr('lang')).toBe(locale)
        expect($('#router-locale').text()).toBe(locale)
        expect(JSON.parse($('#router-locales').text())).toEqual(locales)
        // this will not be the domain's defaultLocale since we don't
        // generate a prerendered version for each locale domain currently
        expect($('#router-default-locale').text()).toBe('en-US')
      }
    }

    for (const item of domainItems) {
      for (const locale of domainLocales) {
        await checkDomainLocales(item.defaultLocale, item.domain, locale)
      }
    }
  })

  it('should provide defaultLocale correctly for locale domain', async () => {
    for (const { host, locale } of [
      { host: 'example.do', locale: 'do' },
      { host: 'example.com', locale: 'go' },
    ]) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/gssp`,
        undefined,
        {
          redirect: 'manual',
          headers: {
            host,
          },
        }
      )

      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('#router-locale').text()).toBe(locale)
      expect($('#router-default-locale').text()).toBe(locale)
      expect(JSON.parse($('#props').text())).toEqual({
        defaultLocale: locale,
        locale,
        locales,
        query: {},
      })
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    }
  })

  it('should generate AMP pages with all locales', async () => {
    for (const locale of nonDomainLocales) {
      const localePath = locale !== 'en-US' ? `/${locale}` : ''
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}${localePath}/amp/amp-hybrid`
      )
      const $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#is-amp').text()).toBe('no')
      expect($('#router-locale').text()).toBe(locale)
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect($('#router-pathname').text()).toBe('/amp/amp-hybrid')
      expect($('#router-as-path').text()).toBe('/amp/amp-hybrid')
      expect(JSON.parse($('#router-query').text())).toEqual({})

      const amphtmlPath = `${ctx.basePath}${localePath}/amp/amp-hybrid${
        ctx.isDev ? '?amp=1' : '.amp'
      }`
      expect($('link[rel=amphtml]').attr('href')).toBe(amphtmlPath)

      const html2 = await renderViaHTTP(ctx.appPort, amphtmlPath)
      const $2 = cheerio.load(html2)
      expect($2('html').attr('lang')).toBe(locale)
      expect($2('#is-amp').text()).toBe('yes')
      expect($2('#router-locale').text()).toBe(locale)
      expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
      expect($2('#router-pathname').text()).toBe('/amp/amp-hybrid')
      expect($2('#router-as-path').text()).toBe('/amp/amp-hybrid')
      expect(JSON.parse($2('#router-query').text())).toEqual({ amp: '1' })
      expect($2('link[rel=amphtml]').attr('href')).toBeFalsy()
    }
  })

  it('should work with AMP first page with all locales', async () => {
    for (const locale of nonDomainLocales) {
      const localePath = locale !== 'en-US' ? `/${locale}` : ''
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}${localePath}/amp/amp-first`
      )
      const $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#is-amp').text()).toBe('yes')
      expect($('#router-locale').text()).toBe(locale)
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect($('#router-pathname').text()).toBe('/amp/amp-first')
      expect($('#router-as-path').text()).toBe('/amp/amp-first')
      expect(JSON.parse($('#router-query').text())).toEqual({})
      expect($('link[rel=amphtml]').attr('href')).toBeFalsy()
    }
  })

  it('should generate fallbacks with all locales', async () => {
    for (const locale of nonDomainLocales) {
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/gsp/fallback/${Math.random()}`
      )
      const $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
    }
  })

  it('should generate auto-export page with all locales', async () => {
    for (const locale of nonDomainLocales) {
      const html = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/${locale}`)
      const $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#router-locale').text()).toBe(locale)
      expect($('#router-as-path').text()).toBe('/')
      expect($('#router-pathname').text()).toBe('/')
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)

      const html2 = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/auto-export`
      )
      const $2 = cheerio.load(html2)
      expect($2('html').attr('lang')).toBe(locale)
      expect($2('#router-locale').text()).toBe(locale)
      expect($2('#router-as-path').text()).toBe('/auto-export')
      expect($2('#router-pathname').text()).toBe('/auto-export')
      expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
    }
  })

  it('should generate non-dynamic GSP page with all locales', async () => {
    for (const locale of nonDomainLocales) {
      const html = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/gsp`
      )
      const $ = cheerio.load(html)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#router-locale').text()).toBe(locale)
      expect($('#router-as-path').text()).toBe('/gsp')
      expect($('#router-pathname').text()).toBe('/gsp')
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)

      // make sure locale is case-insensitive
      const html2 = await renderViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale.toUpperCase()}/gsp`
      )
      const $2 = cheerio.load(html2)
      expect($2('html').attr('lang')).toBe(locale)
      expect($2('#router-locale').text()).toBe(locale)
      expect($2('#router-as-path').text()).toBe('/gsp')
      expect($2('#router-pathname').text()).toBe('/gsp')
      expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
    }
  })

  if (!ctx.isDev) {
    it('should not output GSP pages that returned notFound', async () => {
      const skippedLocales = ['en', 'nl']

      for (const locale of nonDomainLocales) {
        const pagePath = join(ctx.buildPagesDir, locale, 'not-found.html')
        const dataPath = join(ctx.buildPagesDir, locale, 'not-found.json')
        console.log(pagePath)
        expect(await fs.exists(pagePath)).toBe(!skippedLocales.includes(locale))
        expect(await fs.exists(dataPath)).toBe(!skippedLocales.includes(locale))
      }
    })
  }

  it('should 404 for GSP pages that returned notFound', async () => {
    const skippedLocales = ['en', 'nl']

    for (const locale of nonDomainLocales) {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath}/${locale}/not-found`
      )
      expect(res.status).toBe(skippedLocales.includes(locale) ? 404 : 200)

      if (skippedLocales.includes(locale)) {
        const browser = await webdriver(
          ctx.appPort,
          `${ctx.basePath}/${locale}/not-found`
        )
        expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
          locale
        )
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('This page could not be found')

        const props = JSON.parse(await browser.elementByCss('#props').text())

        expect(props.is404).toBe(true)
        expect(props.locale).toBe(locale)

        const parsedUrl = url.parse(
          await browser.eval('window.location.href'),
          true
        )
        expect(parsedUrl.pathname).toBe(`${ctx.basePath}/${locale}/not-found`)
        expect(parsedUrl.query).toEqual({})
      }
    }
  })

  it('should transition on client properly for page that starts with locale', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/fr`)
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/frank')
    })()`)

    await browser.waitForElementByCss('#frank')

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/frank')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/frank')
    expect(
      url.parse(await browser.eval(() => window.location.href)).pathname
    ).toBe(`${ctx.basePath}/fr/frank`)
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should 404 for GSP that returned notFound on client-transition', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/en`)
    await browser.eval(`(function() {
      window.beforeNav = 1
      window.next.router.push('/not-found')
    })()`)

    await browser.waitForElementByCss('h1')

    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props.is404).toBe(true)
    expect(props.locale).toBe('en')
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should render 404 for fallback page that returned 404 on client transition', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en`,
      true,
      true
    )
    await browser.eval(`(function() {
      next.router.push('/not-found/fallback/first')
    })()`)
    await browser.waitForElementByCss('h1')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props.is404).toBe(true)
    expect(props.locale).toBe('en')
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')

    const parsedUrl = url.parse(
      await browser.eval('window.location.href'),
      true
    )
    expect(parsedUrl.pathname).toBe(
      `${ctx.basePath}/en/not-found/fallback/first`
    )
    expect(parsedUrl.query).toEqual({})

    if (ctx.isDev) {
      // make sure page doesn't reload un-necessarily in development
      await waitFor(10 * 1000)
    }
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should render 404 for fallback page that returned 404', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en/not-found/fallback/first`,
      true,
      true
    )
    await browser.waitForElementByCss('h1')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props.is404).toBe(true)
    expect(props.locale).toBe('en')
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')

    const parsedUrl = url.parse(
      await browser.eval('window.location.href'),
      true
    )
    expect(parsedUrl.pathname).toBe(
      `${ctx.basePath}/en/not-found/fallback/first`
    )
    expect(parsedUrl.query).toEqual({})

    if (ctx.isDev) {
      // make sure page doesn't reload un-necessarily in development
      await waitFor(10 * 1000)
    }
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should render 404 for blocking fallback page that returned 404 on client transition', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en`,
      true,
      true
    )
    await browser.eval(`(function() {
      next.router.push('/not-found/blocking-fallback/first')
    })()`)
    await browser.waitForElementByCss('h1')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props.is404).toBe(true)
    expect(props.locale).toBe('en')
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')

    const parsedUrl = url.parse(
      await browser.eval('window.location.href'),
      true
    )
    expect(parsedUrl.pathname).toBe(
      `${ctx.basePath}/en/not-found/blocking-fallback/first`
    )
    expect(parsedUrl.query).toEqual({})

    if (ctx.isDev) {
      // make sure page doesn't reload un-necessarily in development
      await waitFor(10 * 1000)
    }
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should render 404 for blocking fallback page that returned 404', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en/not-found/blocking-fallback/first`,
      true,
      true
    )
    await browser.waitForElementByCss('h1')
    await browser.eval('window.beforeNav = 1')

    expect(await browser.elementByCss('html').text()).toContain(
      'This page could not be found'
    )
    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props.is404).toBe(true)
    expect(props.locale).toBe('en')
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')

    const parsedUrl = url.parse(
      await browser.eval('window.location.href'),
      true
    )
    expect(parsedUrl.pathname).toBe(
      `${ctx.basePath}/en/not-found/blocking-fallback/first`
    )
    expect(parsedUrl.query).toEqual({})

    if (ctx.isDev) {
      // make sure page doesn't reload un-necessarily in development
      await waitFor(10 * 1000)
    }
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should not remove locale prefix for default locale', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/en-US`,
      undefined,
      {
        redirect: 'manual',
        headers: {
          'Accept-Language': 'en-US;q=0.9',
        },
      }
    )

    expect(res.status).toBe(200)

    // const parsedUrl = url.parse(res.headers.get('location'), true)

    // expect(parsedUrl.pathname).toBe('/')
    // expect(parsedUrl.query).toEqual({})

    // make sure locale is case-insensitive
    const res2 = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/eN-Us`,
      undefined,
      {
        redirect: 'manual',
        headers: {
          'Accept-Language': 'en-US;q=0.9',
        },
      }
    )

    expect(res2.status).toBe(200)

    // const parsedUrl2 = url.parse(res.headers.get('location'), true)

    // expect(parsedUrl2.pathname).toBe('/')
    // expect(parsedUrl2.query).toEqual({})
  })

  it('should load getStaticProps page correctly SSR (default locale no prefix)', async () => {
    const html = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/gsp`)
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('en-US')
  })

  it('should load getStaticProps fallback prerender page correctly SSR (default locale no prefix)', async () => {
    const html = await renderViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/gsp/fallback/first`
    )
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      params: {
        slug: 'first',
      },
      defaultLocale: 'en-US',
    })
    expect(JSON.parse($('#router-query').text())).toEqual({
      slug: 'first',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('en-US')
  })

  it('should load getStaticProps fallback non-prerender page correctly (default locale no prefix', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/gsp/fallback/another`
    )

    await browser.waitForElementByCss('#props')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      params: {
        slug: 'another',
      },
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({
      slug: 'another',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
  })

  it('should redirect to locale prefixed route for /', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      undefined,
      {
        redirect: 'manual',
        headers: {
          'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      }
    )
    expect(res.status).toBe(307)

    const parsedUrl = url.parse(res.headers.get('location'), true)
    expect(parsedUrl.pathname).toBe(`${ctx.basePath}/nl-NL`)
    expect(parsedUrl.query).toEqual({})

    const res2 = await fetchViaHTTP(
      ctx.appPort,
      '/',
      { hello: 'world' },
      {
        redirect: 'manual',
        headers: {
          'Accept-Language': 'en;q=0.9',
        },
      }
    )
    expect(res2.status).toBe(307)

    const parsedUrl2 = url.parse(res2.headers.get('location'), true)
    expect(parsedUrl2.pathname).toBe(`${ctx.basePath}/en`)
    expect(parsedUrl2.query).toEqual({ hello: 'world' })
  })

  it('should use default locale for / without accept-language', async () => {
    const res = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($('#router-query').text())).toEqual({})
    expect($('#router-pathname').text()).toBe('/')
    expect($('#router-as-path').text()).toBe('/')

    const res2 = await fetchViaHTTP(
      ctx.appPort,
      `${ctx.basePath || '/'}`,
      { hello: 'world' },
      {
        redirect: 'manual',
      }
    )
    expect(res2.status).toBe(200)

    const html2 = await res2.text()
    const $2 = cheerio.load(html2)

    expect($2('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
    // page is auto-export so query isn't hydrated until client
    expect(JSON.parse($2('#router-query').text())).toEqual({})
    expect($2('#router-pathname').text()).toBe('/')
    // expect($2('#router-as-path').text()).toBe('/')
  })

  it('should load getStaticProps page correctly SSR', async () => {
    const html = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/en-US/gsp`)
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('en-US')
  })

  it('should load getStaticProps fallback prerender page correctly SSR', async () => {
    const html = await renderViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/en-US/gsp/fallback/first`
    )
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      params: {
        slug: 'first',
      },
      defaultLocale: 'en-US',
    })
    expect(JSON.parse($('#router-query').text())).toEqual({
      slug: 'first',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('en-US')
  })

  it('should load getStaticProps fallback non-prerender page correctly', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en/gsp/fallback/another`
    )

    await browser.waitForElementByCss('#props')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en',
      locales,
      params: {
        slug: 'another',
      },
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({
      slug: 'another',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)

    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
  })

  it('should load getServerSideProps page correctly SSR (default locale no prefix)', async () => {
    const html = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/gssp`)
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      query: {},
      defaultLocale: 'en-US',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($('#router-query').text())).toEqual({})
    expect($('html').attr('lang')).toBe('en-US')
  })

  it('should navigate client side for default locale with no prefix', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath || '/'}`)
    await addDefaultLocaleCookie(browser)

    const checkIndexValues = async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
      expect(
        JSON.parse(await browser.elementByCss('#router-locales').text())
      ).toEqual(locales)
      expect(
        JSON.parse(await browser.elementByCss('#router-query').text())
      ).toEqual({})
      expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
      expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
      expect(
        url.parse(await browser.eval(() => window.location.href)).pathname
      ).toBe(`${ctx.basePath || '/'}`)
    }

    await checkIndexValues()

    await browser.elementByCss('#to-another').click()
    await browser.waitForElementByCss('#another')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(
      url.parse(await browser.eval(() => window.location.href)).pathname
    ).toBe(`${ctx.basePath}/another`)

    await browser.elementByCss('#to-index').click()
    await browser.waitForElementByCss('#index')

    await checkIndexValues()

    await browser.elementByCss('#to-gsp').click()
    await browser.waitForElementByCss('#gsp')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/gsp')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/gsp')
    expect(
      url.parse(await browser.eval(() => window.location.href)).pathname
    ).toBe(`${ctx.basePath}/gsp`)

    await browser.elementByCss('#to-index').click()
    await browser.waitForElementByCss('#index')

    await checkIndexValues()

    await browser.manage().deleteCookie('NEXT_LOCALE')
  })

  it('should load getStaticProps fallback non-prerender page another locale correctly', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/nl-NL/gsp/fallback/another`
    )

    await browser.waitForElementByCss('#props')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'nl-NL',
      locales,
      params: {
        slug: 'another',
      },
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({
      slug: 'another',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
  })

  it('should load getStaticProps non-fallback correctly', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/en-US/gsp/no-fallback/first`
    )

    await browser.waitForElementByCss('#props')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      params: {
        slug: 'first',
      },
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({
      slug: 'first',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'en-US'
    )
  })

  it('should load getStaticProps non-fallback correctly another locale', async () => {
    const browser = await webdriver(
      ctx.appPort,
      `${ctx.basePath}/nl-NL/gsp/no-fallback/second`
    )

    await browser.waitForElementByCss('#props')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'nl-NL',
      locales,
      params: {
        slug: 'second',
      },
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({
      slug: 'second',
    })
    expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe(
      'nl-NL'
    )
  })

  it('should load getStaticProps non-fallback correctly another locale via cookie', async () => {
    const html = await renderViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/nl-NL/gsp/no-fallback/second`,
      {},
      {
        headers: {
          cookie: 'NEXT_LOCALE=nl-NL',
        },
      }
    )
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'nl-NL',
      locales,
      params: {
        slug: 'second',
      },
      defaultLocale: 'en-US',
    })
    expect(JSON.parse($('#router-query').text())).toEqual({
      slug: 'second',
    })
    expect($('#router-locale').text()).toBe('nl-NL')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect($('html').attr('lang')).toBe('nl-NL')
  })

  it('should load getServerSideProps page correctly SSR', async () => {
    const html = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/en-US/gssp`)
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      query: {},
      defaultLocale: 'en-US',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($('#router-query').text())).toEqual({})
    expect($('html').attr('lang')).toBe('en-US')

    const html2 = await renderViaHTTP(ctx.appPort, `${ctx.basePath}/nl-NL/gssp`)
    const $2 = cheerio.load(html2)

    expect(JSON.parse($2('#props').text())).toEqual({
      locale: 'nl-NL',
      locales,
      query: {},
      defaultLocale: 'en-US',
    })
    expect($2('#router-locale').text()).toBe('nl-NL')
    expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($2('#router-query').text())).toEqual({})
    expect($2('html').attr('lang')).toBe('nl-NL')
  })

  it('should load dynamic getServerSideProps page correctly SSR', async () => {
    const html = await renderViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/en-US/gssp/first`
    )
    const $ = cheerio.load(html)

    expect(JSON.parse($('#props').text())).toEqual({
      locale: 'en-US',
      locales,
      params: {
        slug: 'first',
      },
      defaultLocale: 'en-US',
    })
    expect($('#router-locale').text()).toBe('en-US')
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($('#router-query').text())).toEqual({ slug: 'first' })
    expect($('html').attr('lang')).toBe('en-US')

    const html2 = await renderViaHTTP(
      ctx.appPort,
      `${ctx.basePath}/nl-NL/gssp/first`
    )
    const $2 = cheerio.load(html2)

    expect(JSON.parse($2('#props').text())).toEqual({
      locale: 'nl-NL',
      locales,
      params: {
        slug: 'first',
      },
      defaultLocale: 'en-US',
    })
    expect($2('#router-locale').text()).toBe('nl-NL')
    expect(JSON.parse($2('#router-locales').text())).toEqual(locales)
    expect(JSON.parse($2('#router-query').text())).toEqual({ slug: 'first' })
    expect($2('html').attr('lang')).toBe('nl-NL')
  })

  it('should navigate to another page and back correctly with locale', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/en`)

    await browser.eval('window.beforeNav = "hi"')

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en',
      locales,
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back().waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
  })

  it('should navigate to getStaticProps page and back correctly with locale', async () => {
    const browser = await webdriver(ctx.appPort, `${ctx.basePath}/en`)

    await browser.eval('window.beforeNav = "hi"')

    await browser.elementByCss('#to-gsp').click().waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#router-pathname').text()).toBe('/gsp')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/gsp')
    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      locale: 'en',
      locales,
      defaultLocale: 'en-US',
    })
    expect(
      JSON.parse(await browser.elementByCss('#router-query').text())
    ).toEqual({})
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back().waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')
    expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
  })
}
