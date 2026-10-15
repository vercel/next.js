import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { readFileSync } from 'fs'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

// This fixture fetches fonts from a local server, which cannot be reached in deploy mode.
// @force-gate !deploy
describe('next/font/google with an extensionless URL', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: require.resolve(
        './google-font-mocked-responses.js'
      ),
    },
  })

  const font = readFileSync(
    require.resolve('../../next-font/app/fonts/my-font.woff2')
  )
  const requests: string[] = []
  let server: Server
  let fontServerUrl: string

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(req.url!)
      res.setHeader('Content-Type', 'font/woff2')
      res.end(font)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    fontServerUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await next.start({ env: { NEXT_TEST_FONT_SERVER_URL: fontServerUrl } })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('self-hosts the font as WOFF2 with size-adjust and production preloads', async () => {
    let href: string
    let css: string
    if (isNextDev) {
      // Dev injects styles in the browser rather than emitting production preloads.
      const browser = await next.browser('/')
      const stylesheets: { href: string | null; css: string }[] =
        await browser.eval(`
        Array.from(document.styleSheets).map(sheet => ({
          href: sheet.href,
          css: Array.from(sheet.cssRules).map(rule => rule.cssText).join('\\n')
        }))
      `)
      css = stylesheets.map((sheet) => sheet.css).join('\n')
      const stylesheet = stylesheets.find((sheet) =>
        sheet.css.includes('.woff2')
      )
      const source = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(
        stylesheet.css
      )?.[1]
      // Turbopack's font URLs are relative to the stylesheet, not the page.
      href = new URL(source, stylesheet.href || next.url).pathname
    } else {
      const res = await next.fetch('/')
      const $ = cheerio.load(await res.text())
      const preloadLink = $('link[rel="preload"][as="font"]')
      let type: string | undefined
      if (preloadLink.length) {
        href = preloadLink.attr('href')
        type = preloadLink.attr('type')
      } else {
        // Prerenders (e.g. with Cache Components) can hoist preloads from the
        // HTML into the `Link` response header instead.
        const preloadHeader = (res.headers.get('link') ?? '')
          .split(/,\s*(?=<)/)
          .find((link) => /;\s*as="?font"?/.test(link))
        href = /^<([^>]+)>/.exec(preloadHeader ?? '')?.[1]
        type = /;\s*type="?([^";]+)"?/.exec(preloadHeader ?? '')?.[1]
      }
      expect(type).toBe('font/woff2')
      const stylesheets = await Promise.all(
        $('link[rel="stylesheet"]')
          .map((_, link) =>
            next.fetch($(link).attr('href')).then((r) => r.text())
          )
          .get()
      )
      css = stylesheets.join('\n')
    }
    expect(href).toMatch(/\/media\/.*-s\.p\.(?:.*\.)?woff2$/)
    expect(css).toContain(href.split('/').pop())
    expect(css).toMatch(/format\(['"]woff2['"]\)/)
    expect(css).not.toContain('/l/font?')

    const response = await next.fetch(href)
    expect(response.status).toBe(200)
    const body = Buffer.from(await response.arrayBuffer())
    if (process.env.IS_TURBOPACK_TEST) {
      expect(requests).toContain('/l/font?kit=a%2Bb%25c=d&skey=test&v=v20')
      expect(body).toEqual(font)
    } else {
      // The Webpack font-fetch mock returns the URL as the file contents.
      expect(body.toString()).toBe(
        `${fontServerUrl}/l/font?kit=a%2Bb%25c=d&skey=test&v=v20`
      )
    }
    expect(next.cliOutput).not.toContain('Using fallback font instead')
  })
})
