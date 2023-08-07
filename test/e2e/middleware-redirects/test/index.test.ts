/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { check, fetchViaHTTP } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'

describe('Middleware Redirect', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
      },
    })
  })
  function tests() {
    it('should redirect correctly with redirect in next.config.js', async () => {
      const browser = await webdriver(next.url, '/')
      await browser.eval('window.next.router.push("/to-new")')
      await browser.waitForElementByCss('#dynamic')
      expect(await browser.elementByCss('#dynamic').text()).toBe(
        'Welcome to a /dynamic/[slug]: new'
      )
    })

    it('does not include the locale in redirects by default', async () => {
      const res = await fetchViaHTTP(next.url, `/old-home`, undefined, {
        redirect: 'manual',
      })
      expect(res.headers.get('location')?.endsWith('/default/about')).toEqual(
        false
      )
    })

    it(`should redirect to data urls with data requests and internal redirects`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/es/old-home.json`,
        { override: 'internal' },
        { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
      )

      expect(
        res.headers
          .get('x-nextjs-redirect')
          ?.endsWith(`/es/new-home?override=internal`)
      ).toEqual(true)
      expect(res.headers.get('location')).toEqual(null)
    })

    it(`should redirect to external urls with data requests and external redirects`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        `/_next/data/${next.buildId}/es/old-home.json`,
        { override: 'external' },
        { redirect: 'manual', headers: { 'x-nextjs-data': '1' } }
      )

      expect(res.headers.get('x-nextjs-redirect')).toEqual(
        'https://example.vercel.sh/'
      )
      expect(res.headers.get('location')).toEqual(null)

      const browser = await webdriver(next.url, '/')
      await browser.elementByCss('#old-home-external').click()
      await check(async () => {
        expect(await browser.elementByCss('h1').text()).toEqual(
          'Example Domain'
        )
        return 'yes'
      }, 'yes')
    })
  }

  function testsWithLocale(locale = '') {
    const label = locale ? `${locale} ` : ``

    it(`${label}should redirect`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/old-home`)
      const html = await res.text()
      const $ = cheerio.load(html)
      const browser = await webdriver(next.url, `${locale}/old-home`)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(
          `${locale}/new-home`
        )
      } finally {
        await browser.close()
      }
      expect($('.title').text()).toBe('Welcome to a new page')
    })

    it(`${label}should implement internal redirects`, async () => {
      const browser = await webdriver(next.url, `${locale}`)
      await browser.eval('window.__SAME_PAGE = true')
      await browser.elementByCss('#old-home').click()
      await browser.waitForElementByCss('#new-home-title')
      expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(
          `${locale}/new-home`
        )
      } finally {
        await browser.close()
      }
    })

    it(`${label}should redirect cleanly with the original url param`, async () => {
      const browser = await webdriver(next.url, `${locale}/blank-page?foo=bar`)
      try {
        expect(
          await browser.eval(
            `window.location.href.replace(window.location.origin, '')`
          )
        ).toBe(`${locale}/new-home`)
      } finally {
        await browser.close()
      }
    })

    it(`${label}should redirect multiple times`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/redirect-me-alot`)
      const browser = await webdriver(next.url, `${locale}/redirect-me-alot`)
      try {
        expect(await browser.eval(`window.location.pathname`)).toBe(
          `${locale}/new-home`
        )
      } finally {
        await browser.close()
      }
      const html = await res.text()
      const $ = cheerio.load(html)
      expect($('.title').text()).toBe('Welcome to a new page')
    })

    it(`${label}should redirect (infinite-loop)`, async () => {
      await expect(
        fetchViaHTTP(next.url, `${locale}/infinite-loop`)
      ).rejects.toThrow()
    })

    it(`${label}should redirect to api route with locale`, async () => {
      const browser = await webdriver(next.url, `${locale}`)
      await browser.elementByCss('#link-to-api-with-locale').click()
      await browser.waitForCondition('window.location.pathname === "/api/ok"')
      await check(() => browser.elementByCss('body').text(), 'ok')
      const logs = await browser.log()
      const errors = logs
        .filter((x) => x.source === 'error')
        .map((x) => x.message)
        .join('\n')
      expect(errors).not.toContain('Failed to lookup route')
    })

    // A regression test for https://github.com/vercel/next.js/pull/41501
    it(`${label}should redirect with a fragment`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/with-fragment`)
      const html = await res.text()
      const $ = cheerio.load(html)
      const browser = await webdriver(next.url, `${locale}/with-fragment`)
      try {
        expect(await browser.eval(`window.location.hash`)).toBe(`#fragment`)
      } finally {
        await browser.close()
      }
      expect($('.title').text()).toBe('Welcome to a new page')
    })
  }
  tests()
  testsWithLocale()
  testsWithLocale('/fr')
})
