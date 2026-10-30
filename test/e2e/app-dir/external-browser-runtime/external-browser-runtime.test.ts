import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

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
      const browser = await next.browser(pathname, {
        async beforePageLoad(page) {
          if (!usesBootstrapData) return

          await page.route(
            (url) => url.pathname === pathname,
            async (route) => {
              const response = await route.fetch()
              const $ = load(await response.text())
              const templates = $('template[data-next-turbopack]')
              expect(templates).toHaveLength(1)

              templates.remove()
              if (order === 'before') {
                $('head').prepend(templates)
              } else {
                // Blocking scripts make the loader run before the parser
                // reaches the bootstrap data at the end of the document.
                $('head script[src]').removeAttr('async')
                $('body').append(templates)
              }

              await route.fulfill({ response, body: $.html() })
            }
          )
        },
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
