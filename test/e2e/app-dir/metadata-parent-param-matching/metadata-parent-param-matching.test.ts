import { nextTestSetup } from 'e2e-utils'

describe('metadata-parent-param-matching', () => {
  const { next } = nextTestSetup({ files: __dirname })
  let buildOutput: string

  beforeAll(() => {
    buildOutput = next.cliOutput
  })

  async function expectImage(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-metadata-id')).toBe('current')
    expect(
      Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8))
    ).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }

  async function expectMissingMetadata(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(404)
    // The metadata wrapper returned this response, so parent admission passed.
    expect(await response.text()).toBe('Not Found')
  }

  it('admits an allowed parent even when only another parent has image IDs', async () => {
    await expectMissingMetadata('/mixed/empty/opengraph-image/new')
    await expectImage('/mixed/with-image/opengraph-image/current')
    expect(
      (await next.fetch('/mixed/outside/opengraph-image/current')).status
    ).toBe(404)
  })

  it('admits an allowed parent when no generated parent has an image ID', async () => {
    await expectMissingMetadata('/empty/empty/opengraph-image/new')
    expect(
      (await next.fetch('/empty/outside/opengraph-image/outside')).status
    ).toBe(404)
  })

  it('preserves parent combinations that currently have no images', async () => {
    await expectMissingMetadata('/correlated/en/first/opengraph-image/new')
    await expectImage('/correlated/ja/second/opengraph-image/current')
    expect(
      (await next.fetch('/correlated/en/second/opengraph-image/current')).status
    ).toBe(404)
  })

  it('admits sitemap parents independently of their shared empty ID list', async () => {
    for (const lang of ['en', 'ja']) {
      await expectMissingMetadata(`/sitemaps/${lang}/sitemap/new.xml`)
    }
    const response = await next.fetch('/sitemaps/outside/sitemap/new.xml')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toBe('Not Found')
  })

  // The manifest and build log are local artifacts. The HTTP cases above also
  // exercise parent admission in development and deployed builds.
  // @force-gate start
  it('keeps admission tuples separate from paths to prerender', async () => {
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    const admission = manifest.routeHandlerParamMatching
    expect(
      admission['/mixed/[parent]/opengraph-image/[__metadata_id__]']
    ).toEqual({ paramNames: ['parent'], tuples: [['empty'], ['with-image']] })
    expect(
      admission['/empty/[parent]/opengraph-image/[__metadata_id__]']
    ).toEqual({ paramNames: ['parent'], tuples: [['empty']] })
    expect(
      admission['/correlated/[lang]/[slug]/opengraph-image/[__metadata_id__]']
    ).toEqual({
      paramNames: ['lang', 'slug'],
      tuples: [
        ['en', 'first'],
        ['ja', 'second'],
      ],
    })
    expect(admission['/sitemaps/[lang]/sitemap/[__metadata_id__]']).toEqual({
      paramNames: ['lang'],
      tuples: [['en'], ['ja']],
    })

    const routes = Object.keys(manifest.routes)
    expect(routes.filter((route) => route.startsWith('/mixed/'))).toEqual([
      '/mixed/with-image/opengraph-image/current',
    ])
    expect(routes.filter((route) => route.startsWith('/correlated/'))).toEqual([
      '/correlated/ja/second/opengraph-image/current',
    ])
    for (const prefix of ['/empty/', '/sitemaps/']) {
      expect(routes.filter((route) => route.startsWith(prefix))).toEqual([])
      expect(
        Object.keys(manifest.dynamicRoutes).filter((route) =>
          route.startsWith(prefix)
        )
      ).toEqual([])
    }
    expect(
      buildOutput.match(/metadata-parent-param-matching: mixed parents/g)
    ).toHaveLength(1)
  })
})
