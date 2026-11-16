import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'

describe('metadata-parent-static-params', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function expectImage(pathname: string, slug: string, id: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-metadata-parent')).toBe(slug)
    expect(response.headers.get('x-metadata-id')).toBe(id)
    expect(
      Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8))
    ).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }

  it('combines each generated parent with its own image IDs', async () => {
    await expectImage(
      '/images/alpha/opengraph-image/alpha-small',
      'alpha',
      'alpha-small'
    )
    await expectImage(
      '/images/alpha/opengraph-image/alpha-large',
      'alpha',
      'alpha-large'
    )
    await expectImage(
      '/images/beta/opengraph-image/beta-wide',
      'beta',
      'beta-wide'
    )
    expect(
      (await next.fetch('/images/alpha/opengraph-image/beta-wide')).status
    ).toBe(404)
  })

  it('discovers function metadata generators before authored static params', async () => {
    for (const [slug, id] of [
      ['alpha', 'alpha-small'],
      ['alpha', 'alpha-large'],
      ['beta', 'beta-wide'],
    ]) {
      await expectImage(
        `/images-late-params/${slug}/opengraph-image/${id}`,
        slug,
        id
      )
    }
    expect(
      (await next.fetch('/images-late-params/alpha/opengraph-image/beta-wide'))
        .status
    ).toBe(404)
  })

  it('discovers variable metadata generators before authored static params', async () => {
    for (const lang of ['en', 'ja']) {
      for (const id of ['0', 'blog']) {
        const response = await next.fetch(
          `/sitemaps-late-params/${lang}/sitemap/${id}.xml`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/xml')
        expect(await response.text()).toContain(
          `<loc>https://metadata-parent-static-params.example/${id}</loc>`
        )
      }
    }
    expect(
      (await next.fetch('/sitemaps-late-params/en/sitemap/unknown.xml')).status
    ).toBe(404)
  })

  it('supports re-exporting the parent generator', async () => {
    await expectImage('/reexported/first/icon/square', 'first', 'square')
    await expectImage('/reexported/second/icon/square', 'second', 'square')
  })

  it('keeps generating image IDs for parents first requested at runtime', async () => {
    await expectImage(
      '/images/later/opengraph-image/later-runtime',
      'later',
      'later-runtime'
    )
    expect(
      (await next.fetch('/images/later/opengraph-image/alpha-small')).status
    ).toBe(404)
  })

  it('combines parent params with sitemap IDs and preserves the XML suffix', async () => {
    for (const lang of ['en', 'ja', 'later']) {
      for (const id of ['0', 'blog']) {
        const response = await next.fetch(`/sitemaps/${lang}/sitemap/${id}.xml`)
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/xml')
        expect(await response.text()).toContain(
          `<loc>https://metadata-parent-static-params.example/${id}</loc>`
        )
      }
    }
    expect((await next.fetch('/sitemaps/en/sitemap/unknown.xml')).status).toBe(
      404
    )
    expect((await next.fetch('/sitemaps/en/sitemap/0')).status).toBe(404)
  })

  it('generates sitemap IDs at runtime when no parent paths are prerendered', async () => {
    // Only local production builds expose their build output.
    if (await gate('start')) {
      expect(next.cliOutput).not.toContain(
        'metadata-parent-static-params: generated runtime sitemap IDs'
      )
    }
    const response = await next.fetch(
      '/runtime-sitemap/later/sitemap/runtime.xml'
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(
      '<loc>https://metadata-parent-static-params.example/runtime</loc>'
    )
  })

  // The manifest is a local build artifact. The HTTP assertions above also run
  // against deployments and verify the corresponding public routes.
  // @force-gate start
  it('prerenders the complete parent and metadata tuples', async () => {
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    const routes = Object.keys(manifest.routes)
    expect(
      routes.filter((route) => route.startsWith('/runtime-sitemap/'))
    ).toEqual([])
    expect(
      routes.filter((route) => route.startsWith('/images/')).sort()
    ).toEqual([
      '/images/alpha/opengraph-image/alpha-large',
      '/images/alpha/opengraph-image/alpha-small',
      '/images/beta/opengraph-image/beta-wide',
    ])
    expect(
      routes.filter((route) => route.startsWith('/images-late-params/')).sort()
    ).toEqual([
      '/images-late-params/alpha/opengraph-image/alpha-large',
      '/images-late-params/alpha/opengraph-image/alpha-small',
      '/images-late-params/beta/opengraph-image/beta-wide',
    ])
    expect(
      routes
        .filter((route) => route.startsWith('/sitemaps-late-params/'))
        .sort()
    ).toEqual([
      '/sitemaps-late-params/en/sitemap/0.xml',
      '/sitemaps-late-params/en/sitemap/blog.xml',
      '/sitemaps-late-params/ja/sitemap/0.xml',
      '/sitemaps-late-params/ja/sitemap/blog.xml',
    ])
    expect(
      routes.filter((route) => route.startsWith('/reexported/')).sort()
    ).toEqual([
      '/reexported/first/icon/square',
      '/reexported/second/icon/square',
    ])
    expect(
      routes.filter((route) => route.startsWith('/sitemaps/')).sort()
    ).toEqual([
      '/sitemaps/en/sitemap/0.xml',
      '/sitemaps/en/sitemap/blog.xml',
      '/sitemaps/ja/sitemap/0.xml',
      '/sitemaps/ja/sitemap/blog.xml',
    ])
  })

  // Checking a rejected build requires a local production build.
  // @force-gate start
  it('rejects class instances returned by the parent generator', async () => {
    await next.stop()
    await next.patchFile(
      'app/reexported/params.ts',
      `class ParentParams {
        slug = 'first'
      }
      export async function generateStaticParams() {
        return [new ParentParams()]
      }`,
      async () => {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          'generateStaticParams in a metadata route returned an invalid value at index 0. Expected a plain parameter object.'
        )
      }
    )
  })
})
