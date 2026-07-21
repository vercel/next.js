import { copyFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// In dev, Turbopack compiles an SSR-free variant on soft navigations; navigation
// and rendering must stay correct. Webpack always renders SSR, so it must behave
// identically.
describe('app dir - dev skip ssr on navigation', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // Loads the client-reference manifest that the most recent compile of
  // `/other` wrote to disk. Requires a unique copy of the file: Jest caches
  // both the module registry and file contents for the duration of a test
  // file, so requiring the manifest path directly would return a stale
  // manifest after a recompile changed it on disk.
  function loadOtherPageClientReferenceManifest() {
    const manifestPath = path.join(
      next.testDir,
      '.next/dev/server/app/other/page_client-reference-manifest.js'
    )
    const tempPath = path.join(
      tmpdir(),
      `client-reference-manifest-${randomUUID()}.js`
    )
    copyFileSync(manifestPath, tempPath)
    delete (globalThis as any).__RSC_MANIFEST
    try {
      // Sets globalThis.__RSC_MANIFEST
      require(tempPath)
      return (globalThis as any).__RSC_MANIFEST['/other/page']
    } finally {
      delete (globalThis as any).__RSC_MANIFEST
      unlinkSync(tempPath)
    }
  }

  it('server-renders the initial page as full HTML', async () => {
    const $ = await next.render$('/')
    expect($('#home-heading').text()).toBe('Home page')
    expect($('#home-button').text()).toContain('home count: 0')
    expect($('html').length).toBe(1)
  })

  it('hydrates and keeps Client Components interactive', async () => {
    const browser = await next.browser('/')
    await browser.elementById('home-button').click()
    await retry(async () => {
      expect(await browser.elementById('home-button').text()).toContain(
        'home count: 1'
      )
    })
  })

  it('soft-navigates to another route and renders it correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementById('to-other').click()

    await retry(async () => {
      expect(await browser.elementById('other-heading').text()).toBe(
        'Other page'
      )
    })
    expect(await browser.elementById('other-text').text()).toBe(
      'server rendered text on other'
    )

    await browser.elementById('other-button').click()
    await retry(async () => {
      expect(await browser.elementById('other-button').text()).toContain(
        'other count: 1'
      )
    })

    if (isTurbopack) {
      // The route was only ever soft-navigated to, so it must have been
      // compiled without SSR: client and RSC module mappings are emitted,
      // but no Client Component SSR chunks were built.
      const manifest = loadOtherPageClientReferenceManifest()
      expect(Object.keys(manifest.clientModules).length).toBeGreaterThan(0)
      expect(Object.keys(manifest.rscModuleMapping).length).toBeGreaterThan(0)
      expect(manifest.ssrModuleMapping).toEqual({})
    }
  })

  it('hard-loads a route that was previously only soft-navigated with full SSR HTML', async () => {
    // Soft-navigate first so the route is compiled via the SSR-free variant.
    const browser = await next.browser('/')
    await browser.elementById('to-other').click()
    await retry(async () => {
      expect(await browser.elementById('other-heading').text()).toBe(
        'Other page'
      )
    })

    // The hard load must still return full SSR HTML (compiles the full endpoint).
    const $ = await next.render$('/other')
    expect($('#other-heading').text()).toBe('Other page')
    expect($('#other-text').text()).toBe('server rendered text on other')
    expect($('#other-button').text()).toContain('other count: 0')
    expect($('html').length).toBe(1)

    if (isTurbopack) {
      // The hard load recompiled the route with SSR, which emits the SSR
      // module mapping again.
      const manifest = loadOtherPageClientReferenceManifest()
      expect(Object.keys(manifest.ssrModuleMapping).length).toBeGreaterThan(0)
    }
  })
})
