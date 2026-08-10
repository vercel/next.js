import http from 'http'
import cheerio from 'cheerio'
import { findPort, retry } from 'next-test-utils'
import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Custom routes i18n', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  let server: http.Server
  let externalPort: number

  beforeAll(async () => {
    externalPort = await findPort()
    server = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(
        `<p id='data'>${JSON.stringify({
          url: req.url,
        })}</p>`
      )
    })
    await new Promise<void>((res, rej) => {
      server.listen(externalPort, (err?: Error) => (err ? rej(err) : res()))
    })

    await next.patchFile('next.config.js', (content) =>
      content.replace(/__EXTERNAL_PORT__/g, String(externalPort))
    )

    if (!isNextDev) {
      await next.build()
    }
    await next.start()
  })

  afterAll(() => {
    server.close()
  })

  it('should respond to default locale redirects correctly', async () => {
    for (const [path, dest] of [
      ['/redirect-1', '/destination-1'],
      ['/en/redirect-1', '/destination-1'],
      ['/fr/redirect-1', '/fr/destination-1'],
      ['/nl-NL/redirect-2', '/destination-2'],
      ['/fr/redirect-2', false],
    ] as const) {
      const res = await next.fetch(path, {
        redirect: 'manual',
      })

      expect(res.status).toBe(dest ? 307 : 404)

      if (dest) {
        const text = await res.text()
        expect(text).toEqual(dest)
        if (dest.startsWith('/')) {
          const parsed = new URL(res.headers.get('location')!)
          expect(parsed.pathname).toBe(dest)
          expect(parsed.search).toBe('')
        } else {
          expect(res.headers.get('location')).toBe(dest)
        }
      }
    }
  })

  it('should rewrite index routes correctly', async () => {
    for (const path of ['/', '/fr', '/nl-NL']) {
      const res = await next.fetch(path, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#links').text()).toBe('Links')
    }
  })

  it('should rewrite correctly', async () => {
    for (const [path, dest] of [
      ['/about', '/about'],
      ['/en/about', '/about'],
      ['/nl-NL/about', '/about'],
      ['/fr/about', '/fr/about'],
      ['/en/catch-all/hello', '/hello'],
      ['/catch-all/hello', '/hello'],
      ['/nl-NL/catch-all/hello', '/hello'],
      ['/fr/catch-all/hello', '/fr/hello'],
    ]) {
      const res = await next.fetch(path, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect(JSON.parse($('#data').text())).toEqual({
        url: dest,
      })
    }
  })

  it('should navigate on the client with rewrites correctly', async () => {
    for (const locale of ['', '/nl-NL', '/fr']) {
      const browser = await next.browser(`${locale}/links`)

      const expectedIndex = locale === '/fr' ? `fr` : ''

      await browser.elementByCss('#to-about').click()

      await retry(async () => {
        const data = JSON.parse(
          cheerio
            .load(await browser.eval('document.documentElement.innerHTML'))(
              '#data'
            )
            .text()
        )
        expect(data.url).toBe(`${expectedIndex ? '/fr' : ''}/about`)
      })

      await browser
        .back()
        .waitForElementByCss('#links')
        .elementByCss('#to-catch-all')
        .click()

      await retry(async () => {
        const data = JSON.parse(
          cheerio
            .load(await browser.eval('document.documentElement.innerHTML'))(
              '#data'
            )
            .text()
        )
        expect(data.url).toBe(`${expectedIndex ? '/fr' : ''}/hello`)
      })

      await browser.back().waitForElementByCss('#links')

      await browser.eval('window.beforeNav = 1')

      await browser.elementByCss('#to-index').click()

      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe(
          locale || '/'
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)

      await browser.elementByCss('#to-links').click()

      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe(
          `${locale}/links`
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })
})
