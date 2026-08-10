import { createServer, request } from 'http'
import type { Server } from 'http'
import { findPort } from 'next-test-utils'
import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('next/dynamic with assetPrefix', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      sass: '1.54.0',
    },
    skipDeployment: true,
  })
  if (skipped) return

  let cdnPort: number
  let cdn: Server

  function createCdnProxy(targetPort: number) {
    return createServer((clientReq, clientRes) => {
      const proxyPath = clientReq.url!.slice('/path-prefix'.length)
      const proxyReq = request(
        {
          hostname: 'localhost',
          port: targetPort,
          path: proxyPath,
          method: clientReq.method,
          headers: clientReq.headers,
        },
        (proxyRes) => {
          proxyRes.headers['Access-Control-Allow-Origin'] =
            `http://localhost:${targetPort}`
          clientRes.writeHead(proxyRes.statusCode!, proxyRes.headers)
          proxyRes.on('error', (e) => {
            require('console').error(e)
          })
          clientRes.on('error', (e) => {
            require('console').error(e)
          })
          proxyRes.pipe(clientRes, { end: true })
        }
      )

      proxyReq.on('error', (e) => {
        require('console').error(e)
      })
      clientReq.on('error', (e) => {
        require('console').error(e)
      })
      clientReq.pipe(proxyReq, { end: true })
    })
  }

  beforeAll(async () => {
    cdnPort = await findPort()

    await next.patchFile('next.config.js', (content) =>
      content.replace('__CDN_PORT__', String(cdnPort))
    )

    if (!isNextDev) {
      await next.build()
    }
    await next.start()

    const nextPort = Number(new URL(next.url).port)
    cdn = createCdnProxy(nextPort)
    await new Promise<void>((resolve) => cdn.listen(cdnPort, resolve))
  })

  afterAll(() => {
    if (cdn) {
      cdn.close()
    }
  })

  it('should load a Pages Router page correctly', async () => {
    const browser = await next.browser('/')

    expect(
      await browser
        .elementByCss('#__next div:nth-child(2)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })

  it('should load a App Router page correctly', async () => {
    const browser = await next.browser('/test-app')

    expect(
      await browser
        .elementByCss('body div:nth-child(3)')
        .getComputedCss('background-color')
    ).toContain('221, 221, 221')

    expect(await browser.eval('document.documentElement.innerHTML')).toContain(
      'Where does it come from?'
    )
  })
})
