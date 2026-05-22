import cheerio from 'cheerio'
import cookie from 'cookie'
import { nextTestSetup } from 'e2e-utils'

function getData(html: string) {
  const $ = cheerio.load(html)
  return {
    nextData: JSON.parse($('#__NEXT_DATA__').html()),
    draft: $('#draft').text(),
    rand: $('#rand').text(),
    count: $('#count').text(),
  }
}

describe('Test Draft Mode', () => {
  const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextDev) {
    it('should start development application', async () => {
      const html = await next.render('/')
      expect(html).toBeTruthy()
    })

    it('should enable draft mode via dev API', async () => {
      const res = await next.fetch('/api/enable')
      expect(res.status).toBe(200)

      const cookies = res.headers
        .get('set-cookie')
        .split(',')
        .map((c) => cookie.parse(c))

      expect(cookies[0]).toBeTruthy()
      expect(cookies[0].__prerender_bypass).toBeTruthy()
    })

    it('should start the client-side browser', async () => {
      const browser = await next.browser('/api/enable')
      await browser.close()
    })

    it('should fetch draft data on SSR', async () => {
      const browser = await next.browser('/api/enable')
      await browser.get(`${next.url}/`)
      await browser.waitForElementByCss('#draft')
      expect(await browser.elementById('draft').text()).toBe('true')
      await browser.close()
    })

    it('should fetch draft data on CST', async () => {
      const browser = await next.browser('/api/enable')
      await browser.get(`${next.url}/to-index`)
      await browser.waitForElementByCss('#to-index')
      await browser.eval('window.itdidnotrefresh = "yep"')
      await browser.elementById('to-index').click()
      await browser.waitForElementByCss('#draft')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('yep')
      expect(await browser.elementById('draft').text()).toBe('true')
      await browser.close()
    })

    it('should disable draft mode', async () => {
      const browser = await next.browser('/api/enable')
      await browser.get(`${next.url}/api/disable`)
      await browser.get(`${next.url}/`)
      await browser.waitForElementByCss('#draft')
      expect(await browser.elementById('draft').text()).toBe('false')
      await browser.close()
    })

    it('should return cookies to be expired after dev server reboot', async () => {
      const res = await next.fetch('/', {
        headers: {
          Cookie: '__prerender_bypass=stale-value',
        },
      })
      expect(res.status).toBe(200)

      const body = await res.text()
      expect(body).not.toContain('"err"')
      expect(body).not.toContain('TypeError')
      expect(body).not.toContain('previewModeId')

      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toBeTruthy()
    })
  }

  if (isNextStart) {
    let cookieString: string
    let initialRand: string
    const getOpts = () => ({ headers: { Cookie: cookieString } })

    it('should start production application', async () => {
      const html = await next.render('/')
      expect(html).toBeTruthy()
    })

    it('should compile successfully', async () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
      expect(next.cliOutput).not.toContain('Build error occurred')
    })

    it('should return prerendered page on first request', async () => {
      const html = await next.render('/')
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('false')
      initialRand = rand
    })

    it('should return prerendered page on second request', async () => {
      const html = await next.render('/')
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('false')
      expect(rand).toBe(initialRand)
    })

    it('should enable draft mode via API', async () => {
      const res = await next.fetch('/api/enable')
      expect(res.status).toBe(200)

      const originalCookies = res.headers.get('set-cookie').split(',')
      const cookies = originalCookies.map((c) => cookie.parse(c))

      expect(cookies.length).toBe(1)
      expect(cookies[0]).toBeTruthy()
      expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'None' })
      expect(cookies[0]).toHaveProperty('__prerender_bypass')
      expect(cookies[0]).not.toHaveProperty('Max-Age')

      cookieString = cookie.serialize(
        '__prerender_bypass',
        cookies[0].__prerender_bypass
      )
    })

    it('should return dynamic response when draft mode enabled', async () => {
      const res = await next.fetch('/', getOpts())
      const html = await res.text()
      const { nextData, draft, rand } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('true')
      expect(rand).not.toBe(initialRand)
    })

    it('should not return fallback page on draft request', async () => {
      const res = await next.fetch('/ssp', getOpts())
      const html = await res.text()

      const { nextData, draft } = getData(html)
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(nextData).toMatchObject({ isFallback: false })
      expect(draft).toBe('true')
    })

    it('should return correct caching headers for draft mode request', async () => {
      const url = `/_next/data/${encodeURI(next.buildId)}/index.json`
      const res = await next.fetch(url, getOpts())
      const json = await res.json()

      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(json).toMatchObject({
        pageProps: {
          draftMode: 'true',
        },
      })
    })

    it('should return cookies to be expired on disable request', async () => {
      const res = await next.fetch('/api/disable', getOpts())
      expect(res.status).toBe(200)

      const cookies = res.headers
        .get('set-cookie')
        .replace(/(=(?!Lax)\w{3}),/g, '$1')
        .split(',')
        .map((c) => cookie.parse(c))

      expect(cookies[0]).toBeTruthy()
      expect(cookies[0]).toMatchObject({
        Path: '/',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
      expect(cookies[0]).toHaveProperty('__prerender_bypass')
      expect(cookies[0]).not.toHaveProperty('Max-Age')
    })

    it('should pass undefined to API routes when not in draft mode', async () => {
      const res = await next.fetch('/api/read')
      const json = await res.json()

      expect(json).toMatchObject({})
    })

    it('should pass draft mode to API routes', async () => {
      const res = await next.fetch('/api/read', getOpts())
      const json = await res.json()

      expect(json).toMatchObject({
        draftMode: true,
      })
    })
  }
})
