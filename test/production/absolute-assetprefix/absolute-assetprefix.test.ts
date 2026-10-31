import { nextTestSetup } from 'e2e-utils'
import * as http from 'http'

describe('absolute assetPrefix with path prefix', () => {
  let cdnPort: number
  let cdn: http.Server
  let cdnAccessLog: string[] = []

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {},
  })

  beforeAll(async () => {
    cdnPort = 0
    cdn = http.createServer((clientReq, clientRes) => {
      const proxyPath = clientReq.url!.slice('/path-prefix'.length)
      cdnAccessLog.push(proxyPath)
      const proxyReq = http.request(
        {
          hostname: 'localhost',
          port: next.appPort,
          path: proxyPath,
          method: clientReq.method,
          headers: clientReq.headers,
        },
        (proxyRes) => {
          proxyRes.headers['Access-Control-Allow-Origin'] =
            `http://localhost:${next.appPort}`
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

    await new Promise<void>((resolve) => cdn.listen(0, resolve))
    cdnPort = (cdn.address() as any).port

    const config = await next.readFile('next.config.js')
    await next.patchFile(
      'next.config.js',
      config.replace('__CDN_PORT__', String(cdnPort))
    )

    await next.start()
  })

  afterEach(() => {
    cdnAccessLog = []
  })

  afterAll(() => {
    cdn?.close()
  })

  it('should not fetch static data from a CDN', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#about-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('hello')
    expect(cdnAccessLog).not.toContain(`/_next/data/${next.buildId}/about.json`)
  })

  it('should fetch from cache correctly', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.clientSideNavigated = true')
    await browser.waitForElementByCss('#about-link').click()
    await browser.waitForElementByCss('#prop')
    await browser.back()
    await browser.waitForElementByCss('#about-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('hello')
    expect(await browser.eval('window.clientSideNavigated')).toBe(true)
    expect(
      cdnAccessLog.filter(
        (path) => path === `/_next/data/${next.buildId}/about.json`
      )
    ).toHaveLength(0)
  })

  it('should work with getStaticPaths prerendered', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#gsp-prerender-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('prerendered')
    expect(cdnAccessLog).not.toContain(
      `/_next/data/${next.buildId}/gsp-fallback/prerendered.json`
    )
  })

  it('should work with getStaticPaths fallback', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#gsp-fallback-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('fallback')
    expect(cdnAccessLog).not.toContain(
      `/_next/data/${next.buildId}/gsp-fallback/fallback.json`
    )
  })

  it('should work with getServerSideProps', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#gssp-link').click()
    const prop = await browser.waitForElementByCss('#prop').text()
    expect(prop).toBe('foo')
    expect(cdnAccessLog).not.toContain(
      `/_next/data/${next.buildId}/gssp.json?prop=foo`
    )
  })
})
