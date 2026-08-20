import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('external-browser-runtime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('streams React instructions as data instead of inline scripts', async () => {
    const html = await next.render('/')

    // `data-rci` is the "complete boundary" instruction React emits once the
    // Suspense boundary resolves. Its presence is the direct evidence that Fizz
    // switched from its SCRIPT streaming format to the DATA format.
    expect(html).toContain('<template data-rci=""')
  })

  if (!isNextDev) {
    // The point of the whole feature: with React's instructions, the Flight
    // payload, and the chunk-group bootstrap all carried as data, a production
    // document has no inline script left, so a Content-Security-Policy no longer
    // needs `unsafe-inline`.
    //
    // Development is excluded on purpose. It still inlines the request id that
    // the dev overlay and HMR socket read, and the dev server is not the target
    // for CSP hardening.
    it('emits no inline scripts', async () => {
      const html = await next.render('/')

      const inlineScripts =
        html.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g) ?? []
      expect(inlineScripts).toEqual([])
    })
  }

  it('carries the Flight payload as data instead of inline scripts', async () => {
    const html = await next.render('/')

    expect(html).toContain('<template data-next-flight="')
    // The inline `self.__next_f.push(...)` scripts are what the templates
    // replace, so none should remain.
    expect(html).not.toContain('self.__next_f')
  })

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
