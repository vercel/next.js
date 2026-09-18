import { nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'

describe('param-matching-root-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let manifest: PrerenderManifest

  beforeAll(async () => {
    manifest = JSON.parse(await next.readFile('.next/prerender-manifest.json'))
  })

  it('blocks an unresolved root parameter without matching configuration', () => {
    expect(
      manifest.dynamicRoutes['/[lang]/inferred/[bottom]'].fallback
    ).toBeNull()
  })

  it('retains the inferred generic render for build-time hints without matching configuration', async () => {
    // Blocking results are not served, but the legacy build still renders
    // them to collect hints. Only explicit matching may skip such a render.
    expect(
      await next.readJSON('.next/server/app/[lang]/inferred/[bottom].meta')
    ).toBeDefined()
  })

  it.each(['empty', 'fallback', 'generated', 'dynamic'])(
    'preserves root-parameter blocking for the %s matching export',
    (route) => {
      // lang is a root parameter because the HTML layout is at app/[lang].
      // Neither an empty export nor configuring only bottom should change
      // the existing requirement to block until root parameters are known.
      expect(
        manifest.dynamicRoutes[`/[lang]/${route}/[bottom]`].fallback
      ).toBeNull()
    }
  )

  it.each(['inferred', 'empty', 'fallback', 'generated', 'dynamic'])(
    'keeps the %s fallback available once the root parameter is known',
    (route) => {
      expect(
        typeof manifest.dynamicRoutes[`/en/${route}/[bottom]`].fallback
      ).toBe('string')
    }
  )
})
