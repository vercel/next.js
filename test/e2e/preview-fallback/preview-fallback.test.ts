import { nextTestSetup, isNextStart } from 'e2e-utils'
import cheerio from 'cheerio'
import cookie from 'cookie'
import { retry } from 'next-test-utils'
import fs from 'fs'
import { join } from 'path'
import { RouteKind } from 'next/dist/server/route-kind'

describe('Preview mode with fallback pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      cookie: '0.7.2',
    },
  })

  let previewCookie: string

  async function getDraftModeCookie() {
    const response = await next.fetch('/api/enable-draft')
    expect(response.status).toBe(200)
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    const cookies = setCookie!.split(',').map((value) => cookie.parse(value))
    const bypass = cookies.find(
      (value) => value.__prerender_bypass
    )?.__prerender_bypass
    expect(Boolean(bypass)).toBe(true)
    expect(cookies.some((value) => value.__next_preview_data)).toBe(false)
    return cookie.serialize('__prerender_bypass', bypass!)
  }

  it('should get preview cookie correctly', async () => {
    const res = await next.fetch('/api/enable')
    previewCookie = ''

    expect(res.headers.get('set-cookie')).toMatch(
      /(__prerender_bypass|__next_preview_data)/
    )

    res.headers
      .get('set-cookie')!
      .split(',')
      .forEach((c) => {
        const cookies = cookie.parse(c)
        const isBypass = cookies.__prerender_bypass

        if (isBypass || cookies.__next_preview_data) {
          if (previewCookie) previewCookie += '; '

          previewCookie += `${
            isBypass ? '__prerender_bypass' : '__next_preview_data'
          }=${cookies[isBypass ? '__prerender_bypass' : '__next_preview_data']}`
        }
      })
  })

  it('should not write preview index SSG page to cache', async () => {
    const html = await next.render('/')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
    })

    const res = await next.fetch('/', {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
    })

    if (isNextStart) {
      const fsHtml = fs.readFileSync(
        join(next.testDir, '.next', 'server', 'pages', 'index.html'),
        'utf8'
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())
      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
      })
    }

    const html2 = await next.render('/')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
    })
  })

  it('should not write preview dynamic prerendered SSG page to cache no fallback', async () => {
    const html = await next.render('/no-fallback/first')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })

    const res = await next.fetch('/no-fallback/first', {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'first' },
    })

    if (isNextStart) {
      const fsHtml = fs.readFileSync(
        join(
          next.testDir,
          next.getPrerenderFilePath('/no-fallback/first', '.html', {
            router: 'pages',
            route: {
              kind: RouteKind.PAGES,
              sourceRoute: '/no-fallback/[post]',
            },
          })
        ),
        'utf8'
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())
      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'first' },
      })
    }

    const html2 = await next.render('/no-fallback/first')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })
  })

  it('should not write preview dynamic SSG page to cache no fallback', async () => {
    const res1 = await next.fetch('/no-fallback/second')
    expect(res1.status).toBe(404)

    const res = await next.fetch('/no-fallback/second', {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'second' },
    })

    if (isNextStart) {
      expect(
        fs.existsSync(
          join(
            next.testDir,
            next.getPrerenderFilePath('/no-fallback/second', '.html', {
              router: 'pages',
              route: {
                kind: RouteKind.PAGES,
                sourceRoute: '/no-fallback/[post]',
              },
            })
          )
        )
      ).toBe(false)
    }

    const res2 = await next.fetch('/no-fallback/second')
    expect(res2.status).toBe(404)
  })

  it('should not write preview dynamic prerendered SSG page to cache with fallback', async () => {
    const html = await next.render('/fallback/first')
    const props = JSON.parse(cheerio.load(html)('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })

    const res = await next.fetch('/fallback/first', {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'first' },
    })

    if (isNextStart) {
      const fsHtml = fs.readFileSync(
        join(
          next.testDir,
          next.getPrerenderFilePath('/fallback/first', '.html', {
            router: 'pages',
            route: { kind: RouteKind.PAGES, sourceRoute: '/fallback/[post]' },
          })
        ),
        'utf8'
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())
      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'first' },
      })
    }

    const html2 = await next.render('/fallback/first')
    const props2 = JSON.parse(cheerio.load(html2)('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'first' },
    })
  })

  it('should not write preview dynamic non-prerendered SSG page to cache with fallback', async () => {
    let browser = await next.browser('/fallback/second')

    await retry(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props.params).toBeTruthy()
    })

    const props = JSON.parse(await browser.elementByCss('#props').text())

    expect(props).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'second' },
    })

    const res = await next.fetch('/fallback/second', {
      headers: {
        cookie: previewCookie,
      },
    })

    const previewHtml = await res.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'second' },
    })

    if (isNextStart) {
      const fsHtml = fs.readFileSync(
        join(
          next.testDir,
          next.getPrerenderFilePath('/fallback/second', '.html', {
            router: 'pages',
            route: { kind: RouteKind.PAGES, sourceRoute: '/fallback/[post]' },
          })
        ),
        'utf8'
      )
      const fsProps = JSON.parse(cheerio.load(fsHtml)('#props').text())
      expect(fsProps).toEqual({
        preview: false,
        previewData: null,
        params: { post: 'second' },
      })
    }

    browser = await next.browser('/fallback/second')

    await retry(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props.params).toBeTruthy()
    })

    const props2 = JSON.parse(await browser.elementByCss('#props').text())

    expect(props2).toEqual({
      preview: false,
      previewData: null,
      params: { post: 'second' },
    })
  })

  // @force-gate !deploy || adapter
  it('should preview an unlisted fallback: false page in Draft Mode', async () => {
    const pathname = '/no-fallback/draft-only'
    expect((await next.fetch(pathname)).status).toBe(404)

    const response = await next.fetch(pathname, {
      headers: { cookie: await getDraftModeCookie() },
    })
    const props = JSON.parse(
      cheerio
        .load(await response.text())('#props')
        .text()
    )
    expect(props).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'draft-only' },
    })
    expect((await next.fetch(pathname)).status).toBe(404)
  })

  // @force-gate !deploy || adapter
  it('should preview an unlisted data request in Draft Mode', async () => {
    const knownHtml = await next.render('/no-fallback/first')
    const buildId = JSON.parse(
      cheerio.load(knownHtml)('#__NEXT_DATA__').text()
    ).buildId
    const pathname = '/_next/data/' + buildId + '/no-fallback/draft-only.json'
    expect((await next.fetch(pathname)).status).toBe(404)

    const response = await next.fetch(pathname, {
      headers: { cookie: await getDraftModeCookie() },
    })
    expect((await response.json()).pageProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'draft-only' },
    })
    expect((await next.fetch(pathname)).status).toBe(404)
  })

  // @force-gate !deploy || adapter
  it('should reject invalid preview data on an unlisted fallback: false path', async () => {
    const headers = {
      cookie: (await getDraftModeCookie()) + '; __next_preview_data=invalid',
    }
    const response = await next.fetch('/no-fallback/draft-only', { headers })
    expect(response.status).toBe(404)
    expect(
      cheerio
        .load(await response.text())('#props')
        .text()
    ).toBe('')

    const knownHtml = await next.render('/no-fallback/first')
    const buildId = JSON.parse(
      cheerio.load(knownHtml)('#__NEXT_DATA__').text()
    ).buildId
    const dataPath = '/_next/data/' + buildId + '/no-fallback/draft-only.json'
    const dataResponse = await next.fetch(dataPath, { headers })
    expect(dataResponse.status).toBe(404)
  })

  // @force-gate !deploy || adapter
  it('should not replace a prerendered page when previewing it in Draft Mode', async () => {
    const pathname = '/no-fallback/first'
    const beforeHtml = await next.render(pathname)
    const beforeProps = JSON.parse(cheerio.load(beforeHtml)('#props').text())
    expect(beforeProps.preview).toBe(false)

    const response = await next.fetch(pathname, {
      headers: { cookie: await getDraftModeCookie() },
    })
    const draftProps = JSON.parse(
      cheerio
        .load(await response.text())('#props')
        .text()
    )
    expect(draftProps).toEqual({
      preview: true,
      previewData: {},
      params: { post: 'first' },
    })

    const afterHtml = await next.render(pathname)
    expect(JSON.parse(cheerio.load(afterHtml)('#props').text())).toEqual(
      beforeProps
    )
  })
})
