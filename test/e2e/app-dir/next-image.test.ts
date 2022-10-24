import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import path from 'path'
import webdriver from 'next-webdriver'

describe('app dir next-image', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'next-image')),
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
      skipStart: true,
    })
    await next.start()
  })
  afterAll(() => next.destroy())

  describe('ssr content', () => {
    it('should render images on / route', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)

      const layout = $('#app-layout')
      expect(layout.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(layout.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const page = $('#app-page')
      expect(page.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
      )
      expect(page.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x'
      )

      const comp = $('#app-comp')
      expect(comp.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80'
      )
      expect(comp.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x'
      )
    })

    it('should render images on /client route', async () => {
      const html = await renderViaHTTP(next.url, '/client')
      const $ = cheerio.load(html)

      const root = $('#app-layout')
      expect(root.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(root.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const layout = $('#app-client-layout')
      expect(layout.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55'
      )
      expect(layout.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=55 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55 2x'
      )

      const page = $('#app-client-page')
      expect(page.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60'
      )
      expect(page.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=60 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60 2x'
      )

      const comp = $('#app-client-comp')
      expect(comp.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50'
      )
      expect(comp.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=50 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50 2x'
      )
    })

    it('should render images nested under page dir on /nested route', async () => {
      const html = await renderViaHTTP(next.url, '/nested')
      const $ = cheerio.load(html)

      const root = $('#app-layout')
      expect(root.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(root.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const layout = $('#app-nested-layout')
      expect(layout.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70'
      )
      expect(layout.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=70 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70 2x'
      )

      const page = $('#app-nested-page')
      expect(page.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
      )
      expect(page.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
      )

      const comp = $('#app-nested-comp')
      expect(comp.attr('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65'
      )
      expect(comp.attr('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=65 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65 2x'
      )
    })
  })

  describe('browser content', () => {
    it('should render images on / route', async () => {
      const browser = await webdriver(next.url, '/')

      const layout = await browser.elementById('app-layout')
      expect(await layout.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(await layout.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const page = await browser.elementById('app-page')
      expect(await page.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90'
      )
      expect(await page.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=90 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90 2x'
      )

      const comp = await browser.elementById('app-comp')
      expect(await comp.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80'
      )
      expect(await comp.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=80 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=80 2x'
      )
    })

    it('should render images on /client route', async () => {
      const browser = await webdriver(next.url, '/client')

      const root = await browser.elementById('app-layout')
      expect(await root.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(await root.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const layout = await browser.elementById('app-client-layout')
      expect(await layout.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55'
      )
      expect(await layout.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=55 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=55 2x'
      )

      const page = await browser.elementById('app-client-page')
      expect(await page.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60'
      )
      expect(await page.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=60 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=60 2x'
      )

      const comp = await browser.elementById('app-client-comp')
      expect(await comp.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50'
      )
      expect(await comp.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=50 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=50 2x'
      )
    })

    it('should render images nested under page dir on /nested route', async () => {
      const browser = await webdriver(next.url, '/nested')

      const root = await browser.elementById('app-layout')
      expect(await root.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85'
      )
      expect(await root.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=85 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=85 2x'
      )

      const layout = await browser.elementById('app-nested-layout')
      expect(await layout.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70'
      )
      expect(await layout.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=70 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=70 2x'
      )

      const page = await browser.elementById('app-nested-page')
      expect(await page.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
      )
      expect(await page.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
      )

      const comp = await browser.elementById('app-nested-comp')
      expect(await comp.getAttribute('src')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65'
      )
      expect(await comp.getAttribute('srcset')).toBe(
        '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=65 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=65 2x'
      )
    })
  })

  describe('image content', () => {
    it('should render images on / route', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)

      const res1 = await fetchViaHTTP(next.url, $('#app-layout').attr('src'))
      expect(res1.status).toBe(200)
      expect(res1.headers.get('content-type')).toBe('image/png')

      const res2 = await fetchViaHTTP(next.url, $('#app-page').attr('src'))
      expect(res2.status).toBe(200)
      expect(res2.headers.get('content-type')).toBe('image/png')

      const res3 = await fetchViaHTTP(next.url, $('#app-comp').attr('src'))
      expect(res3.status).toBe(200)
      expect(res3.headers.get('content-type')).toBe('image/png')
    })

    it('should render images on /client route', async () => {
      const html = await renderViaHTTP(next.url, '/client')
      const $ = cheerio.load(html)

      const res1 = await fetchViaHTTP(next.url, $('#app-layout').attr('src'))
      expect(res1.status).toBe(200)
      expect(res1.headers.get('content-type')).toBe('image/png')

      const res2 = await fetchViaHTTP(
        next.url,
        $('#app-client-layout').attr('src')
      )
      expect(res2.status).toBe(200)
      expect(res2.headers.get('content-type')).toBe('image/png')

      const res3 = await fetchViaHTTP(
        next.url,
        $('#app-client-page').attr('src')
      )
      expect(res3.status).toBe(200)
      expect(res3.headers.get('content-type')).toBe('image/png')

      const res4 = await fetchViaHTTP(
        next.url,
        $('#app-client-comp').attr('src')
      )
      expect(res4.status).toBe(200)
      expect(res4.headers.get('content-type')).toBe('image/png')
    })

    it('should render images nested under page dir on /nested route', async () => {
      const html = await renderViaHTTP(next.url, '/nested')
      const $ = cheerio.load(html)

      const res1 = await fetchViaHTTP(next.url, $('#app-layout').attr('src'))
      expect(res1.status).toBe(200)
      expect(res1.headers.get('content-type')).toBe('image/png')

      const res2 = await fetchViaHTTP(
        next.url,
        $('#app-nested-layout').attr('src')
      )
      expect(res2.status).toBe(200)
      expect(res2.headers.get('content-type')).toBe('image/jpeg')

      const res3 = await fetchViaHTTP(
        next.url,
        $('#app-nested-page').attr('src')
      )
      expect(res3.status).toBe(200)
      expect(res3.headers.get('content-type')).toBe('image/jpeg')

      const res4 = await fetchViaHTTP(
        next.url,
        $('#app-nested-comp').attr('src')
      )
      expect(res4.status).toBe(200)
      expect(res4.headers.get('content-type')).toBe('image/jpeg')
    })
  })
})
