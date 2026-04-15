import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import cookie from 'cookie'
import { retry } from 'next-test-utils'

describe('Preview mode with fallback pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      cookie: '0.7.2',
    },
  })

  let previewCookie: string

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
})
