import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { createServer, type Server } from 'http'
import httpProxy from 'http-proxy'
import { findPort, gate, retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('external-browser-runtime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('emits no inline scripts', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    const $ = load(await response.text())
    const inlineScripts = $('script:not([src])')
    if (isNextDev) {
      expect(inlineScripts.length).toBeGreaterThan(0)
      expect(response.headers.get('content-security-policy')).toBeNull()
    } else {
      expect(inlineScripts).toHaveLength(0)
      expect(response.headers.get('content-security-policy')).toBe(
        "script-src 'self'"
      )
    }
  })

  it('carries the Flight payload as data instead of inline scripts', async () => {
    const html = await next.render('/')

    expect(html).toContain('<template data-next-flight="')
    // The inline `self.__next_f.push(...)` scripts are what the templates
    // replace, so none should remain.
    expect(html).not.toContain('self.__next_f')
  })

  it.each(['/', '/static', '/missing'])(
    'carries the Turbopack bootstrap as data for %s',
    async (pathname) => {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(pathname === '/missing' ? 404 : 200)
      const $ = load(await response.text())
      const templates = $('template[data-next-turbopack]')

      if (await gate((c) => !c.dev && c.turbopack)) {
        expect(templates).toHaveLength(1)
        const params = JSON.parse(templates.attr('data-next-turbopack'))
        expect(params).toEqual([
          {
            otherChunks: expect.any(Array),
            runtimeModuleIds: expect.any(Array),
          },
        ])
        expect(params[0].otherChunks.length).toBeGreaterThan(0)
        expect(params[0].runtimeModuleIds.length).toBeGreaterThan(0)
      } else {
        expect(templates).toHaveLength(0)
      }

      if (!isNextDev) {
        expect($('script:not([src])')).toHaveLength(0)
        expect(response.headers.get('content-security-policy')).toBe(
          "script-src 'self'"
        )
      }
    }
  )

  it.each([
    ['/', 'before'],
    ['/', 'after'],
    ['/static', 'before'],
    ['/static', 'after'],
    ['/missing', 'before'],
    ['/missing', 'after'],
  ])(
    'hydrates %s with bootstrap data %s the loader',
    async (pathname, order) => {
      const usesBootstrapData = await gate((c) => !c.dev && c.turbopack)
      let release: () => void
      const ready = new Promise<void>((resolve) => {
        release = resolve
      })
      let server: Server
      let proxy: ReturnType<typeof httpProxy.createProxyServer>
      let browser: Awaited<ReturnType<typeof next.browser>>
      let loaderBlocked = false
      let page: Page

      try {
        let baseUrl: number
        if (usesBootstrapData && order === 'after') {
          const response = await next.fetch(pathname)
          const html = await response.text()
          const metadataOffset = html.indexOf('<template data-next-turbopack=')
          expect(metadataOffset).toBeGreaterThan(0)
          const headers = Object.fromEntries(response.headers)
          delete headers['content-encoding']
          delete headers['content-length']
          delete headers['transfer-encoding']

          proxy = httpProxy.createProxyServer({
            target: next.url,
            changeOrigin: true,
          })
          server = createServer((req, res) => {
            if (req.url === pathname) {
              res.writeHead(response.status, headers)
              // Preserve the document bytes and order, but pause delivery before
              // the metadata so the async loader can execute during parsing.
              res.write(html.slice(0, metadataOffset))
              void ready.then(() => res.end(html.slice(metadataOffset)))
            } else {
              proxy.web(req, res)
            }
          })
          baseUrl = await findPort()
          await new Promise<void>((resolve) => server.listen(baseUrl, resolve))
        }

        browser = await next.browser(pathname, {
          baseUrl,
          waitUntil: 'commit',
          waitHydration: false,
          async beforePageLoad(value) {
            page = value
            if (!usesBootstrapData || order !== 'before') return

            await page.route('**/*.js*', async (route) => {
              const response = await route.fetch()
              if ((await response.text()).includes('data-next-turbopack')) {
                loaderBlocked = true
                await ready
              }
              await route.fulfill({ response })
            })
          },
        })

        if (usesBootstrapData) {
          await retry(async () => {
            const loaderExecuted = await page.evaluate(
              '!!self.TURBOPACK && !Array.isArray(self.TURBOPACK)'
            )
            expect(loaderExecuted).toBe(order === 'after')
            expect(
              await page.evaluate(
                () =>
                  document.querySelectorAll('template[data-next-turbopack]')
                    .length
              )
            ).toBe(order === 'before' ? 1 : 0)
            if (order === 'before') {
              expect(loaderBlocked).toBe(true)
            } else {
              expect(await page.evaluate(() => document.readyState)).toBe(
                'loading'
              )
            }
          })
        }
        release()

        await retry(async () => {
          expect(await browser.eval('!!window.__NEXT_HYDRATED')).toBe(true)
        })
        await browser.elementByCss('#counter').click()
        await retry(async () => {
          expect(await browser.elementByCss('#counter').text()).toBe('count: 1')
        })
        expect(
          await browser.eval(
            () =>
              document.querySelectorAll('template[data-next-turbopack]').length
          )
        ).toBe(0)
      } finally {
        release()
        await browser?.close()
        if (server) {
          server.closeAllConnections()
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
          })
          proxy.close()
        }
      }
    }
  )

  it('loads the runtime as a static asset', async () => {
    const $ = await next.render$('/')

    // React emits the runtime as an async script in the head. The filename is
    // not asserted on: webpack names it readably while Turbopack uses an opaque
    // content hash, so the asset is identified by what it contains instead.
    const srcs = $('head script[src]')
      .map((_, el) => $(el).attr('src'))
      .get()
    expect(srcs.length).toBeGreaterThan(0)

    const responses = await Promise.all(
      srcs.map(async (src) => {
        const res = await next.fetch(new URL(src, 'http://n').pathname)
        return { src, status: res.status, body: await res.text() }
      })
    )

    // `installFizzInstrObserver` is the runtime's entry point: it attaches the
    // MutationObserver that picks up React's `<template data-r*i>` elements.
    const runtimes = responses.filter((r) =>
      r.body.includes('installFizzInstrObserver')
    )
    expect(runtimes).toHaveLength(1)
    expect(runtimes[0].status).toBe(200)
    expect($(`script[src="${runtimes[0].src}"]`).attr('crossorigin')).toBe(
      'use-credentials'
    )
    expect(runtimes[0].body).not.toContain('data-next-turbopack')

    const bootstrapConsumers = responses.filter((r) =>
      r.body.includes('data-next-turbopack')
    )
    if (await gate((c) => !c.dev && c.turbopack)) {
      expect(bootstrapConsumers).toHaveLength(1)
      expect(bootstrapConsumers[0].status).toBe(200)
      expect(bootstrapConsumers[0].src).not.toBe(runtimes[0].src)
    } else {
      expect(bootstrapConsumers).toHaveLength(0)
    }
  })

  it('reveals suspended content and hydrates', async () => {
    const browser = await next.browser('/')

    // The boundary content only appears if the external runtime picked up the
    // `data-rci` template and ran the instruction.
    await retry(async () => {
      expect(await browser.elementByCss('#slow').text()).toBe('slow content')
    })

    expect(await browser.elementByCss('#shell').text()).toBe('hello world')

    // Proves hydration attached handlers.
    await browser.elementByCss('#counter').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('count: 1')
    })
  })
})
