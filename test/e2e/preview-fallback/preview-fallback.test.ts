import { nextTestSetup, isNextStart } from 'e2e-utils'
import cheerio from 'cheerio'
import { retry } from 'next-test-utils'
import fs from 'fs'
import { join } from 'path'

describe('Preview mode with fallback pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let previewCookie: string

  it('should set and read preview cookies over HTTP', async () => {
    const res = await next.fetch('/api/enable')
    previewCookie = ''

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(
      /(__prerender_bypass|__next_preview_data)/
    )

    const setCookie = res.headers.get('set-cookie')!
    previewCookie = ['__prerender_bypass', '__next_preview_data']
      .map((name) => {
        const value = setCookie.match(
          new RegExp(`(?:^|,\\s*)${name}=([^;]+)`)
        )?.[1]
        expect(value).toBeDefined()
        return `${name}=${value}`
      })
      .join('; ')

    const previewRes = await next.fetch('/', {
      headers: {
        cookie: previewCookie,
      },
    })
    const previewHtml = await previewRes.text()
    const previewProps = JSON.parse(cheerio.load(previewHtml)('#props').text())

    expect(previewRes.status).toBe(200)
    expect(previewProps).toEqual({
      preview: true,
      previewData: {},
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
          '.next',
          'server',
          'pages',
          'no-fallback',
          'first.html'
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
            '.next',
            'server',
            'pages',
            'no-fallback',
            'second.html'
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
          '.next',
          'server',
          'pages',
          'fallback',
          'first.html'
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
          '.next',
          'server',
          'pages',
          'fallback',
          'second.html'
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
})
