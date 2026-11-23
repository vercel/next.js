/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'

describe('action-forward-encode', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  let strictServer: any
  let strictPort: number

  beforeAll(async () => {
    const getPort = require('get-port')
    const http = require('http')
    strictPort = await getPort()
    const appPort = Number(next.appPort)

    strictServer = http.createServer((req: any, res: any) => {
      if (/[\[\]]/.test(req.url || '')) {
        res.statusCode = 400
        res.end('bad path')
        return
      }
      const proxyReq = http.request(
        {
          hostname: 'localhost',
          port: appPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes: any) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res)
        }
      )
      proxyReq.on('error', (err: any) => {
        res.statusCode = 502
        res.end(String(err))
      })
      req.pipe(proxyReq)
    })

    await new Promise<void>((resolve) => {
      strictServer.listen(strictPort, () => resolve())
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => strictServer?.close(() => resolve()))
  })

  it('should encode forwarded action pathnames with dynamic segments', async () => {
    const browser = await next.browser(`http://localhost:${strictPort}/caller`)
    await browser.elementById('call').click()
    await check(() => browser.elementById('call').text(), 'ok')
  })
})
