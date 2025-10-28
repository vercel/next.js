/* eslint-env jest */

// These tests are defined here and used in `app-dir.test.ts` and
// `pages-dir.test.ts` so that both test suites can be run in parallel.

import type { Playwright } from 'next-webdriver'

import cheerio from 'cheerio'
import type { NextInstance } from 'e2e-utils'

export function testShouldRedirect(
  next: NextInstance,
  expectations: [string, string][]
) {
  it.each(expectations)(
    '%s should redirect to %s',
    async (route, expectedLocation) => {
      const res = await next.fetch(route, { redirect: 'manual' })
      expect(res.status).toBe(308)
      const { pathname } = new URL(res.headers.get('location'))
      expect(pathname).toBe(expectedLocation)
    }
  )
}

export function testShouldResolve(
  next: NextInstance,
  expectations: [string, string, string][]
) {
  it.each(expectations)(
    '%s should resolve to %s, with router path %s',
    async (route, expectedPage, expectedRouterPath) => {
      const res = await next.fetch(route, { redirect: 'error' })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#page-marker').text()).toBe(expectedPage)
      expect($('#router-pathname').text()).toBe(expectedRouterPath)
    }
  )

  it.each(expectations)(
    '%s should client side render %s, with router path %s',
    async (route, expectedPage, expectedRouterPath) => {
      let browser: Playwright | undefined
      try {
        browser = await next.browser(route)

        await browser.waitForElementByCss('#hydration-marker', {
          state: 'attached',
        })
        const text = await browser.elementByCss('#page-marker').text()
        expect(text).toBe(expectedPage)
        const routerPathname = await browser
          .elementByCss('#router-pathname')
          .text()
        expect(routerPathname).toBe(expectedRouterPath)
      } finally {
        if (browser) await browser.close()
      }
    }
  )
}

export function testExternalLinkShouldRewriteTo(
  next: NextInstance,
  expectations: [string, string][]
) {
  it.each(expectations)(
    '%s should have href %s',
    async (linkPage, expectedHref) => {
      const $ = await next.render$(linkPage)
      expect($('#link').attr('href')).toBe(expectedHref)
    }
  )
}

export function testLinkShouldRewriteTo(
  next: NextInstance,
  expectations: [string, string][]
) {
  it.each(expectations)(
    '%s should have href %s',
    async (linkPage, expectedHref) => {
      const $ = await next.render$(linkPage)
      expect($('#link').attr('href')).toBe(expectedHref)
    }
  )

  it.each(expectations)(
    '%s should navigate to %s',
    async (linkPage, expectedHref) => {
      let browser: Playwright | undefined
      try {
        browser = await next.browser(linkPage)
        await browser.elementByCss('#link').click()

        await browser.waitForElementByCss('#hydration-marker', {
          state: 'attached',
        })
        const url = new URL(await browser.eval('window.location.href'))
        const pathname = url.href.slice(url.origin.length)
        expect(pathname).toBe(expectedHref)
      } finally {
        if (browser) await browser.close()
      }
    }
  )

  it.each(expectations)(
    '%s should push route to %s',
    async (linkPage, expectedHref) => {
      let browser: Playwright | undefined
      try {
        browser = await next.browser(linkPage)
        await browser.elementByCss('#route-pusher').click()

        await browser.waitForElementByCss('#hydration-marker', {
          state: 'attached',
        })
        const url = new URL(await browser.eval('window.location.href'))
        const pathname = url.href.slice(url.origin.length)
        expect(pathname).toBe(expectedHref)
      } finally {
        if (browser) await browser.close()
      }
    }
  )
}
