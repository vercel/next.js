import { getPreloadableFonts } from '../../packages/next/src/server/app-render/get-preloadable-fonts'
import type { NextFontManifest } from '../../packages/next/src/build/webpack/plugins/next-font-manifest-plugin'

function createManifest(app: NextFontManifest['app']): NextFontManifest {
  return {
    pages: {},
    app,
    appUsingSizeAdjust: false,
    pagesUsingSizeAdjust: false,
  }
}

describe('getPreloadableFonts', () => {
  it('looks up routes using default single-part page extensions', () => {
    const manifest = createManifest({
      'app/page': ['/font1.p.woff2'],
    })

    // app/page.tsx -> app/page
    expect(getPreloadableFonts(manifest, 'app/page.tsx', new Set())).toEqual([
      '/font1.p.woff2',
    ])
  })

  it('strips multi-part custom page extensions when looking up routes', () => {
    const manifest = createManifest({
      'app/page': ['/font1.p.woff2'],
    })

    // with pageExtensions: ['page.tsx'], files are named page.page.tsx
    expect(
      getPreloadableFonts(manifest, 'app/page.page.tsx', new Set())
    ).toEqual(['/font1.p.woff2'])
  })

  it('handles absolute file paths from the render tree', () => {
    const manifest = createManifest({
      '/project/app/page': ['/font1.p.woff2'],
    })

    expect(
      getPreloadableFonts(manifest, '/project/app/page.page.tsx', new Set())
    ).toEqual(['/font1.p.woff2'])
  })

  it('preserves dots inside route path segments', () => {
    const manifest = createManifest({
      'app/docs.v1/page': ['/font1.p.woff2'],
    })

    expect(
      getPreloadableFonts(manifest, 'app/docs.v1/page.page.tsx', new Set())
    ).toEqual(['/font1.p.woff2'])

    // a route segment that is not part of the extension must not be stripped
    expect(
      getPreloadableFonts(manifest, 'app/docs.v1/page.tsx', new Set())
    ).toEqual(['/font1.p.woff2'])
  })

  it('does not look up a key when the path has no extension', () => {
    const manifest = createManifest({
      'app/page': ['/font1.p.woff2'],
    })

    expect(getPreloadableFonts(manifest, 'app/page', new Set())).toEqual([
      '/font1.p.woff2',
    ])
    expect(getPreloadableFonts(manifest, 'app/unknown', new Set())).toBeNull()
  })

  it('deduplicates fonts already injected by an outer layout', () => {
    const manifest = createManifest({
      'app/page': ['/font1.p.woff2'],
    })
    const injected = new Set<string>(['/font1.p.woff2'])

    // fonts exist but were all already preloaded by an outer layout,
    // and some other fonts have been previously preloaded -> null
    expect(getPreloadableFonts(manifest, 'app/page.tsx', injected)).toBeNull()
  })

  it('only returns fonts that have not been injected yet', () => {
    const manifest = createManifest({
      'app/page': ['/font1.p.woff2', '/font2.p.woff2'],
    })
    const injected = new Set<string>(['/font1.p.woff2'])

    expect(getPreloadableFonts(manifest, 'app/page.tsx', injected)).toEqual([
      '/font2.p.woff2',
    ])
    // the returned font is recorded so nested layers do not repeat it
    expect(injected.has('/font2.p.woff2')).toBe(true)
  })

  it('returns an empty array when the entry exists but has no preloaded fonts', () => {
    const manifest = createManifest({
      'app/page': [],
    })

    expect(
      getPreloadableFonts(manifest, 'app/page.page.tsx', new Set())
    ).toEqual([])
  })

  it('returns null when there is no manifest or no file path', () => {
    const manifest = createManifest({})

    expect(getPreloadableFonts(undefined, 'app/page.tsx', new Set())).toBeNull()
    expect(getPreloadableFonts(manifest, undefined, new Set())).toBeNull()
  })
})
