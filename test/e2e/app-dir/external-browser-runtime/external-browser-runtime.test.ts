import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
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
      const html = await response.text()
      const $ = load(html)
      // The bootstrap rides on the Turbopack runtime's own script tag, which
      // reads it from `document.currentScript`.
      const runtimeScripts = $('script[data-turbopack-bootstrap]')
      expect($('template[data-turbopack-bootstrap]')).toHaveLength(0)

      if (await gate((c) => !c.dev && c.turbopack)) {
        expect(runtimeScripts).toHaveLength(1)
        expect(runtimeScripts.attr('src')).toBeTruthy()
        expect(html.match(/data-turbopack-bootstrap=/g)).toHaveLength(1)
        const params = JSON.parse(
          runtimeScripts.attr('data-turbopack-bootstrap')
        )
        expect(params).toEqual([
          {
            otherChunks: expect.any(Array),
            runtimeModuleIds: expect.any(Array),
          },
        ])
        expect(params[0].otherChunks.length).toBeGreaterThan(0)
        expect(params[0].runtimeModuleIds.length).toBeGreaterThan(0)
      } else {
        expect(runtimeScripts).toHaveLength(0)
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
    'hydrates %s when the Turbopack runtime runs %s the other chunks',
    async (pathname, order) => {
      const usesBootstrapData = await gate((c) => !c.dev && c.turbopack)
      let runtimePath: string | undefined
      if (usesBootstrapData) {
        const $ = load(await (await next.fetch(pathname)).text())
        const runtimeSrc = $('script[data-turbopack-bootstrap]').attr('src')
        expect(runtimeSrc).toBeTruthy()
        runtimePath = new URL(runtimeSrc, 'http://n').pathname
      }

      let release: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let blocked = false
      let page: Page
      let browser: Awaited<ReturnType<typeof next.browser>>

      try {
        browser = await next.browser(pathname, {
          waitUntil: 'commit',
          waitHydration: false,
          async beforePageLoad(value) {
            page = value
            if (!runtimePath) return

            // 'before': hold the other scripts until the runtime has run.
            // 'after': hold the runtime until the entry chunks have queued
            // their registrations.
            await page.route('**/*.js*', async (route) => {
              const isRuntime =
                new URL(route.request().url()).pathname === runtimePath
              if (isRuntime === (order === 'after')) {
                blocked = true
                await released
              }
              await route.continue()
            })
          },
        })

        if (usesBootstrapData) {
          await retry(async () => {
            expect(blocked).toBe(true)
            if (order === 'before') {
              // The runtime replaced the queue with `{ push: registerChunk }`.
              expect(
                await page.evaluate(
                  '!!self.TURBOPACK && !Array.isArray(self.TURBOPACK)'
                )
              ).toBe(true)
            } else {
              expect(
                await page.evaluate(
                  'Array.isArray(self.TURBOPACK) && self.TURBOPACK.length > 0'
                )
              ).toBe(true)
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
      } finally {
        release()
        await browser?.close()
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
    expect(runtimes[0].body).not.toContain('turbopackBootstrap')

    // The Turbopack runtime reads `document.currentScript.dataset.turbopackBootstrap`.
    const bootstrapConsumers = responses.filter((r) =>
      r.body.includes('turbopackBootstrap')
    )
    if (await gate((c) => !c.dev && c.turbopack)) {
      // The Turbopack runtime that reads the bootstrap is the script carrying it.
      expect(bootstrapConsumers).toHaveLength(1)
      expect(bootstrapConsumers[0].status).toBe(200)
      expect(bootstrapConsumers[0].src).not.toBe(runtimes[0].src)
      expect(
        $(`script[src="${bootstrapConsumers[0].src}"]`).attr(
          'data-turbopack-bootstrap'
        )
      ).toBeTruthy()
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
