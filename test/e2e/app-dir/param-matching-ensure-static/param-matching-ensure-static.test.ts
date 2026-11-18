import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'
import type { PrerenderManifest } from 'next/dist/build'
import * as cheerio from 'cheerio'

describe('param-matching-ensure-static', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  it.each([
    ['/inferred/t1/b1', 't1/b1'],
    ['/inferred/t2/b2', 't2/b2'],
    ['/blocking/t1/b1', 't1/b1'],
    ['/blocking/t2/b2', 't2/b2'],
    ['/closed-prefix/t1/b1', 't1/b1'],
    ['/closed-prefix/t1/b2', 't1/b2'],
    ['/closed-prefix-inferred/t1/b2', 't1/b2'],
    ['/closed/t1/b1', 't1/b1'],
    ['/override/t2', 't2'],
  ])('serves a complete navigation for %s', async (pathname, params) => {
    for (const headers of [{}, { rsc: '1' }]) {
      const response = await next.fetch(pathname, { headers })
      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toContain(params)
      if (!isNextDev) {
        // Navigation mode must never send a generic shell and resume it,
        // even for params that were not in generateStaticParams.
        if (!headers.rsc) {
          const $ = cheerio.load(body)
          expect($('#params').text()).toBe(params)
          expect($('#pending')).toHaveLength(0)
          // The changing marker makes response equality below distinguish a
          // cached prerender from repeated renders of otherwise identical UI.
          expect($('#generation')).toHaveLength(1)
        }
        expect(
          await next.fetch(pathname, { headers }).then((r) => r.text())
        ).toBe(body)
      }
    }
  })

  it.each([
    '/closed-prefix/t2/b1',
    '/closed-prefix-inferred/t2/b1',
    '/closed/t1/b2',
    '/closed/t2/b1',
  ])('does not open a not-found parameter in %s', async (pathname) => {
    expect((await next.fetch(pathname)).status).toBe(404)
  })

  it.each([
    ['/blocking/t2/navigation', 't2/navigation'],
    ['/closed-prefix/t1/navigation', 't1/navigation'],
  ])('supports a client navigation to %s', async (pathname, params) => {
    const browser = await next.browser('/')
    await browser.elementByCss(`a[href="${pathname}"]`).click()
    expect(await browser.elementByCss('#params').text()).toBe(params)
    await waitForNoRedbox(browser)
  })

  it('still allows fallback matching with ensureStatic = "prefetch"', async () => {
    expect((await next.fetch('/prefetch/novel')).status).toBe(200)
    const browser = await next.browser('/prefetch/novel')
    expect(await browser.elementByCss('#params').text()).toBe('novel')
    await waitForNoRedbox(browser)
  })

  // The deployment behavior is covered above; these assertions inspect local
  // build artifacts to protect the adapter contract as well.
  // @force-gate start
  it('keeps matchers and generic prefetch data without servable navigation fallbacks', async () => {
    const manifest: PrerenderManifest = await next.readJSON(
      '.next/prerender-manifest.json'
    )
    const hints = await next.readJSON('.next/server/prefetch-hints.json')
    for (const route of [
      'inferred',
      'blocking',
      'closed-prefix',
      'closed-prefix-inferred',
      'closed',
    ]) {
      const pattern = `/${route}/[top]/[bottom]`
      const matcher = manifest.dynamicRoutes[pattern]
      expect(matcher._isEnsureStaticPage).toBe(true)
      expect(matcher.fallback).toBe(route.startsWith('closed') ? false : null)
      expect(manifest.routes[pattern]).toBeUndefined()
      // ensureStatic needs the generic render's segment data even when
      // paramMatching would normally omit that blocking/not-found candidate.
      expect(hints[pattern]).toBeDefined()
      expect(await next.hasFile(`.next/server/app${pattern}.meta`)).toBe(true)
    }
    for (const route of ['closed-prefix', 'closed-prefix-inferred']) {
      expect(manifest.dynamicRoutes[`/${route}/t1/[bottom]`]).toMatchObject({
        fallback: null,
        _isEnsureStaticPage: true,
      })
      expect(manifest.routes[`/${route}/t1/b1`]).toBeDefined()
      expect(
        await next.hasFile(`.next/server/app/${route}/t1/[bottom].meta`)
      ).toBe(false)
    }
  })
})
