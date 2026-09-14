import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import cookie from 'cookie'
import qs from 'querystring'

function getData(html: string) {
  const $ = cheerio.load(html)
  const nextData = $('#__NEXT_DATA__')
  const preEl = $('#props-pre')
  const routerData = JSON.parse($('#router').text())
  return {
    nextData: JSON.parse(nextData.html()),
    pre: preEl.text(),
    routerData,
  }
}

describe('Prerender Preview Mode', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: {
      cookie: '0.7.2',
    },
  })

  if (isNextStart) {
    it('should return prerendered page on first request', async () => {
      const html = await next.render('/')
      const { nextData, pre, routerData } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(nextData.isPreview).toBeUndefined()
      expect(pre).toBe('false and null')
      expect(routerData.isPreview).toBe(false)
    })

    it('should return prerendered page on second request', async () => {
      const html = await next.render('/')
      const { nextData, pre, routerData } = getData(html)
      expect(nextData).toMatchObject({ isFallback: false })
      expect(nextData.isPreview).toBeUndefined()
      expect(pre).toBe('false and null')
      expect(routerData.isPreview).toBe(false)
    })
  }

  it('should throw error when setting too large of preview data', async () => {
    const res = await next.fetch('/api/preview?tooBig=true')
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('too big')
  })

  let previewCookieString: string
  it('should enable preview mode', async () => {
    const res = await next.fetch('/api/preview?lets=goooo')
    expect(res.status).toBe(200)

    const originalCookies = res.headers.get('set-cookie')!.split(',')
    const cookies = originalCookies.map((cookieRaw) => cookie.parse(cookieRaw))

    if (isNextStart) {
      expect(originalCookies.every((c) => c.includes('; Secure;'))).toBe(true)
    }

    expect(cookies.length).toBe(2)
    if (isNextStart) {
      expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'None' })
    }
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    if (isNextStart) {
      expect(cookies[1]).toMatchObject({ Path: '/', SameSite: 'None' })
    }
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')

    previewCookieString =
      cookie.serialize('__prerender_bypass', cookies[0].__prerender_bypass) +
      '; ' +
      cookie.serialize('__next_preview_data', cookies[1].__next_preview_data)
  })

  it('should expire cookies with a maxAge', async () => {
    const expiry = '60'
    const res = await next.fetch(`/api/preview?cookieMaxAge=${expiry}`)
    expect(res.status).toBe(200)

    const originalCookies = res.headers.get('set-cookie')!.split(',')
    const cookies = originalCookies.map((cookieRaw) => cookie.parse(cookieRaw))

    if (isNextStart) {
      expect(originalCookies.every((c) => c.includes('; Secure;'))).toBe(true)
    }

    expect(cookies.length).toBe(2)
    if (isNextStart) {
      expect(cookies[0]).toMatchObject({ Path: '/', SameSite: 'None' })
    }
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]['Max-Age']).toBe(expiry)
    if (isNextStart) {
      expect(cookies[1]).toMatchObject({ Path: '/', SameSite: 'None' })
    }
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]['Max-Age']).toBe(expiry)
  })

  it('should set custom path cookies', async () => {
    const path = '/path'
    const res = await next.fetch(`/api/preview?cookiePath=${path}`)
    expect(res.status).toBe(200)

    const originalCookies = res.headers.get('set-cookie')!.split(',')
    const cookies = originalCookies.map((cookieRaw) => cookie.parse(cookieRaw))

    if (isNextStart) {
      expect(originalCookies.every((c) => c.includes('; Secure;'))).toBe(true)
    }

    expect(cookies.length).toBe(2)
    if (isNextStart) {
      expect(cookies[0]).toMatchObject({ Path: path, SameSite: 'None' })
    }
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]['Path']).toBe(path)
    if (isNextStart) {
      expect(cookies[1]).toMatchObject({ Path: path, SameSite: 'None' })
    }
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]['Path']).toBe(path)
  })

  it('should not return fallback page on preview request', async () => {
    const res = await next.fetch('/', {
      headers: { Cookie: previewCookieString },
    })
    const html = await res.text()

    const { nextData, pre, routerData } = getData(html)
    if (isNextStart) {
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
    }
    expect(nextData).toMatchObject({ isFallback: false, isPreview: true })
    expect(pre).toBe('true and {"lets":"goooo"}')
    expect(routerData.isPreview).toBe(true)
  })

  if (isNextStart) {
    it('should return correct caching headers for data preview request', async () => {
      const res = await next.fetch(
        `/_next/data/${encodeURI(next.buildId)}/index.json`,
        { headers: { Cookie: previewCookieString } }
      )
      const json = await res.json()

      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(json).toMatchObject({
        pageProps: {
          preview: true,
          previewData: { lets: 'goooo' },
        },
      })
    })
  }

  it('should return cookies to be expired on reset request', async () => {
    const res = await next.fetch('/api/reset', {
      headers: { Cookie: previewCookieString },
    })
    expect(res.status).toBe(200)

    const cookies = res.headers
      .get('set-cookie')!
      .replace(/(=(?!Lax)\w{3}),/g, '$1')
      .split(',')
      .map((cookieRaw) => cookie.parse(cookieRaw))

    expect(cookies.length).toBe(2)
    if (isNextStart) {
      expect(cookies[0]).toMatchObject({
        Path: '/',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
    }
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    if (isNextStart) {
      expect(cookies[1]).toMatchObject({
        Path: '/',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
    }
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')
  })

  it('should return cookies to be expired on reset request with path specified', async () => {
    const res = await next.fetch('/api/reset?cookiePath=/blog', {
      headers: { Cookie: previewCookieString },
    })
    expect(res.status).toBe(200)

    const cookies = res.headers
      .get('set-cookie')!
      .replace(/(=(?!Lax)\w{3}),/g, '$1')
      .split(',')
      .map((cookieRaw) => cookie.parse(cookieRaw))

    expect(cookies.length).toBe(2)
    if (isNextStart) {
      expect(cookies[0]).toMatchObject({
        Path: '/blog',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
    }
    expect(cookies[0]).toHaveProperty('__prerender_bypass')
    expect(cookies[0]).not.toHaveProperty('Max-Age')
    if (isNextStart) {
      expect(cookies[1]).toMatchObject({
        Path: '/blog',
        SameSite: 'None',
        Expires: 'Thu 01 Jan 1970 00:00:00 GMT',
      })
    }
    expect(cookies[1]).toHaveProperty('__next_preview_data')
    expect(cookies[1]).not.toHaveProperty('Max-Age')
  })

  it('should pass undefined to API routes when not in preview', async () => {
    const res = await next.fetch('/api/read')
    const json = await res.json()
    expect(json).toMatchObject({})
  })

  it('should pass the preview data to API routes', async () => {
    const res = await next.fetch('/api/read', {
      headers: { Cookie: previewCookieString },
    })
    const json = await res.json()

    expect(json).toMatchObject({
      preview: true,
      previewData: { lets: 'goooo' },
    })
  })

  if (isNextStart) {
    it('should compile successfully', async () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
      expect(next.cliOutput).not.toContain('Build error occurred')
    })

    it('should start production application', async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
    })
  }

  if (isNextDev) {
    it('should start development application', async () => {
      const html = await next.render('/')
      expect(html).toBeTruthy()
    })

    it('should enable preview mode in dev', async () => {
      const res = await next.fetch(
        '/api/preview?' + qs.stringify({ lets: 'goooo' })
      )
      expect(res.status).toBe(200)

      const cookies = res.headers
        .get('set-cookie')!
        .split(',')
        .map((cookieRaw) => cookie.parse(cookieRaw))

      expect(cookies.length).toBe(2)
    })

    it('should return cookies to be expired after dev server reboot', async () => {
      const res = await next.fetch('/', {
        headers: {
          Cookie:
            '__prerender_bypass=stale-value; __next_preview_data=stale-data',
        },
      })
      expect(res.status).toBe(200)

      const body = await res.text()
      expect(body).not.toContain('"err"')
      expect(body).not.toContain('TypeError')
      expect(body).not.toContain('previewModeId')

      const cookies = res.headers
        .get('set-cookie')!
        .replace(/(=(?!Lax)\w{3}),/g, '$1')
        .split(',')
        .map((cookieRaw) => cookie.parse(cookieRaw))

      expect(cookies.length).toBe(2)
    })

    it('should start the client-side browser', async () => {
      const browser = await next.browser(
        '/api/preview?' + qs.stringify({ client: 'mode' })
      )
      const url = await browser.url()
      expect(url).toContain('/api/preview')
    })

    it('should fetch preview data on SSR via browser', async () => {
      const browser = await next.browser(
        '/api/preview?' + qs.stringify({ client: 'mode' })
      )

      await browser.loadPage(next.url + '/')
      await browser.waitForElementByCss('#props-pre')
      expect(await browser.elementById('props-pre').text()).toBe(
        'true and {"client":"mode"}'
      )
    })

    it('should fetch preview data on CST', async () => {
      const browser = await next.browser(
        '/api/preview?' + qs.stringify({ client: 'mode' })
      )

      await browser.loadPage(next.url + '/to-index')
      await browser.waitForElementByCss('#to-index')
      await browser.eval('window.itdidnotrefresh = "hello"')
      await browser.elementById('to-index').click()
      await browser.waitForElementByCss('#props-pre')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
      expect(await browser.elementById('props-pre').text()).toBe(
        'true and {"client":"mode"}'
      )
    })

    it('should fetch prerendered data', async () => {
      const browser = await next.browser('/api/reset')

      await browser.loadPage(next.url + '/')
      await browser.waitForElementByCss('#props-pre')
      expect(await browser.elementById('props-pre').text()).toBe(
        'false and null'
      )
    })

    it('should fetch live static props with preview active', async () => {
      const browser = await next.browser(
        '/api/preview?' + qs.stringify({ client: 'mode' })
      )

      await browser.loadPage(next.url + '/')
      await browser.waitForElementByCss('#ssg-random')
      const initialRandom = await browser.elementById('ssg-random').text()

      await browser.elementById('reload-props').click()
      await browser.waitForElementByCss('#ssg-reloaded')

      expect(await browser.elementById('ssg-random').text()).not.toBe(
        initialRandom
      )
    })
  }
})
