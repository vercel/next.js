import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import httpProxy from 'http-proxy'
import { join } from 'path'
import http from 'http'
import webdriver from 'next-webdriver'
import assert from 'assert'
import { check, renderViaHTTP, waitFor } from 'next-test-utils'

describe('manual-client-base-path', () => {
  if ((global as any).isNextDeploy) {
    it('should skip deploy', () => {})
    return
  }

  let next: NextInstance
  let server: http.Server
  let appPort: string
  const basePath = '/docs-proxy'
  const responses = new Set()

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
      },
      dependencies: {},
    })
    const getProxyTarget = (req) => {
      const destination = new URL(next.url)
      const reqUrl = new URL(req.url, 'http://localhost')
      // force IPv4 for testing in node 17+ as the default
      // switched to favor IPv6 over IPv4
      destination.hostname = '127.0.0.1'

      if (req.url.startsWith(basePath)) {
        destination.pathname = reqUrl.pathname || '/'
      } else {
        destination.pathname = `${basePath}${
          reqUrl.pathname === '/' ? '' : reqUrl.pathname
        }`
      }
      reqUrl.searchParams.forEach((value, key) => {
        destination.searchParams.set(key, value)
      })

      console.log('proxying', req.url, 'to:', destination.toString())
      return destination
    }

    server = http
      .createServer((req, res) => {
        responses.add(res)
        res.on('close', () => responses.delete(res))

        const destination = getProxyTarget(req)
        const proxy = httpProxy.createProxy({
          changeOrigin: true,
          ignorePath: true,
          xfwd: true,
          proxyTimeout: 30_000,
          target: destination.toString(),
        })

        proxy.on('error', (err) => console.error(err))
        proxy.web(req, res)
      })
      .listen(0)

    server.on('upgrade', (req, socket, head) => {
      responses.add(socket)
      socket.on('close', () => responses.delete(socket))

      const destination = getProxyTarget(req)
      const proxy = httpProxy.createProxy({
        changeOrigin: true,
        ignorePath: true,
        xfwd: true,
        proxyTimeout: 30_000,
        target: destination.toString(),
      })

      proxy.on('error', (err) => console.error(err))
      proxy.ws(req, socket, head)
    })

    // @ts-ignore type is incorrect
    appPort = server.address().port
  })
  afterAll(async () => {
    await next.destroy()
    try {
      server.close()
      responses.forEach((res: any) => res.end?.() || res.close?.())
    } catch (err) {
      console.error(err)
    }
  })

  it('should not warn for flag in output', async () => {
    await renderViaHTTP(next.url, '/')
    expect(next.cliOutput).not.toContain('exist in this version of Next.js')
  })

  for (const [asPath, pathname, query] of [
    ['/'],
    ['/another'],
    ['/dynamic/first', '/dynamic/[slug]', { slug: 'first' }],
    ['/dynamic/second', '/dynamic/[slug]', { slug: 'second' }],
  ]) {
    // eslint-disable-next-line
    it(`should not update with basePath on mount ${asPath}`, async () => {
      const fullAsPath = (asPath as string) + '?update=1'
      const browser = await webdriver(appPort, fullAsPath)
      await browser.eval('window.beforeNav = 1')

      expect(await browser.eval('window.location.pathname')).toBe(asPath)
      expect(await browser.eval('window.location.search')).toBe('?update=1')

      await check(async () => {
        assert.deepEqual(
          JSON.parse(await browser.elementByCss('#router').text()),
          {
            asPath: fullAsPath,
            pathname: pathname || asPath,
            query: {
              update: '1',
              ...((query as any) || {}),
            },
            basePath,
          }
        )
        return 'success'
      }, 'success')

      await waitFor(5 * 1000)
      expect(await browser.eval('window.beforeNav')).toBe(1)
    })
  }

  it('should navigate correctly from index', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.eval('window.beforeNav = 1')

    await browser.elementByCss('#to-another').click()
    await check(() => browser.elementByCss('#page').text(), 'another page')
    expect(await browser.eval('window.location.pathname')).toBe('/another')

    await browser.back()
    await check(() => browser.elementByCss('#page').text(), 'index page')
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.forward()
    await check(() => browser.elementByCss('#page').text(), 'another page')
    expect(await browser.eval('window.location.pathname')).toBe('/another')

    await browser.back()
    await check(() => browser.elementByCss('#page').text(), 'index page')
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.elementByCss('#to-another-slash').click()
    await check(() => browser.elementByCss('#page').text(), 'another page')
    expect(await browser.eval('window.location.pathname')).toBe('/another')

    await browser.back()
    await check(() => browser.elementByCss('#page').text(), 'index page')
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.elementByCss('#to-dynamic').click()
    await check(() => browser.elementByCss('#page').text(), 'dynamic page')
    expect(await browser.eval('window.location.pathname')).toBe(
      '/dynamic/first'
    )

    await browser.back()
    await check(() => browser.elementByCss('#page').text(), 'index page')
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.forward()
    await check(() => browser.elementByCss('#page').text(), 'dynamic page')
    expect(await browser.eval('window.location.pathname')).toBe(
      '/dynamic/first'
    )

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should navigate correctly from another', async () => {
    const browser = await webdriver(appPort, '/another')
    await browser.eval('window.beforeNav = 1')

    await browser.elementByCss('#to-index').click()
    await check(() => browser.elementByCss('#page').text(), 'index page')
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.elementByCss('#to-dynamic').click()
    await check(() => browser.elementByCss('#page').text(), 'dynamic page')
    expect(await browser.eval('window.location.pathname')).toBe(
      '/dynamic/first'
    )

    await browser.elementByCss('#to-dynamic').click()
    await check(
      () => browser.eval('window.location.pathname'),
      '/dynamic/second'
    )

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })
})
