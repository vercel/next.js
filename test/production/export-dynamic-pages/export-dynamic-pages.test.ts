import path from 'path'
import http from 'http'
import fs from 'fs'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('Export Dynamic Pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let server: http.Server
  let port: number
  beforeAll(async () => {
    await next.build()

    const outDir = path.join(next.testDir, 'out')
    server = http.createServer((req, res) => {
      let urlPath = (req.url || '/').split('?')[0]
      try {
        urlPath = decodeURIComponent(urlPath)
      } catch {}
      let filePath = path.join(outDir, urlPath)

      if (!path.extname(filePath)) {
        filePath += '.html'
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        const ext = path.extname(filePath)
        const contentType =
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
          }[ext] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(data)
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve())
    })
    port = (server.address() as import('net').AddressInfo).port
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('should of exported with correct asPath', async () => {
    const html = await next.readFile('out/regression/jeff-is-cool.html')
    const $ = cheerio.load(html)
    expect($('#asPath').text()).toBe('/regression/jeff-is-cool')
  })

  it('should hydrate with correct asPath', async () => {
    expect.assertions(1)
    const browser = await next.browser('/regression/jeff-is-cool', {
      baseUrl: port,
    })
    try {
      expect(await browser.eval(`window.__AS_PATHS`)).toEqual([
        '/regression/jeff-is-cool',
      ])
    } finally {
      await browser.close()
    }
  })
})
