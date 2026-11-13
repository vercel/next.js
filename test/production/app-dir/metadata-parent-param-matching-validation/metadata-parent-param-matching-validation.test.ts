import { nextTestSetup } from 'e2e-utils'

describe('metadata-parent-param-matching-validation', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function expectImage(pathname: string, id: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-metadata-id')).toBe(id)
    expect(
      Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8))
    ).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }

  it('preserves empty parents without inventing prerendered paths', async () => {
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(
      manifest.routeHandlerParamMatching[
        '/images/[parent]/opengraph-image/[__metadata_id__]'
      ]
    ).toEqual({ paramNames: ['parent'], tuples: [['empty'], ['with-image']] })
    expect(
      manifest.routeHandlerParamMatching[
        '/all-empty/[parent]/opengraph-image/[__metadata_id__]'
      ]
    ).toEqual({ paramNames: ['parent'], tuples: [['empty-all']] })
    expect(
      manifest.routeHandlerParamMatching[
        '/sitemaps/[lang]/sitemap/[__metadata_id__]'
      ]
    ).toEqual({ paramNames: ['lang'], tuples: [['en'], ['ja']] })
    expect(
      Object.keys(manifest.routes).filter((route) =>
        route.startsWith('/images/')
      )
    ).toEqual(['/images/with-image/opengraph-image/old'])
    for (const prefix of ['/all-empty/', '/sitemaps/']) {
      expect(
        Object.keys(manifest.routes).filter((route) => route.startsWith(prefix))
      ).toEqual([])
      expect(
        Object.keys(manifest.dynamicRoutes).filter((route) =>
          route.startsWith(prefix)
        )
      ).toEqual([])
    }
    await expectImage('/images/with-image/opengraph-image/old', 'old')
  })

  it('serves new metadata IDs for initially empty parents after invalidation', async () => {
    await next.patchFile(
      'ids.json',
      JSON.stringify({
        images: {
          empty: ['new'],
          'with-image': ['old', 'later'],
          'empty-all': ['first'],
          outside: ['outside'],
        },
        sitemaps: ['first'],
      })
    )
    const refreshed = await next.fetch('/refresh', { method: 'POST' })
    expect(refreshed.status).toBe(200)
    expect(await refreshed.text()).toBe('refreshed')

    // This open route checks that invalidation reached the shared cached data.
    // None of the new image URLs was requested before the data changed.
    await expectImage('/open/empty/opengraph-image/new', 'new')
    await expectImage('/images/empty/opengraph-image/new', 'new')
    await expectImage('/images/with-image/opengraph-image/later', 'later')
    await expectImage('/all-empty/empty-all/opengraph-image/first', 'first')
    for (const prefix of ['images', 'all-empty']) {
      expect(
        (await next.fetch(`/${prefix}/outside/opengraph-image/outside`)).status
      ).toBe(404)
    }
    for (const lang of ['en', 'ja']) {
      const response = await next.fetch(`/sitemaps/${lang}/sitemap/first.xml`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/xml')
      expect(await response.text()).toContain(
        '<loc>https://metadata-parent-param-matching-validation.example/first</loc>'
      )
    }
    expect(
      (await next.fetch('/sitemaps/outside/sitemap/first.xml')).status
    ).toBe(404)
  })

  describe('invalid parent declarations', () => {
    beforeAll(async () => {
      await next.stop()
    })

    it.each([
      {
        name: 'a missing closed parent with no image IDs',
        parents: [{}],
        ids: [],
        mode: 'not-found',
        expected:
          'configures parameter "parent" as "not-found", but generateStaticParams returned a result without that parameter',
      },
      {
        name: 'a non-string closed parent with no image IDs',
        parents: [{ parent: 123 }],
        ids: [],
        mode: 'not-found',
        expected:
          'A required parameter (parent) was not provided as a string received number',
      },
      {
        name: 'a generated dynamic parent with no image IDs',
        parents: [{ parent: 'allowed' }],
        ids: [],
        mode: 'dynamic',
        expected:
          'cannot prerender parameter "parent" because parameter "parent" is configured as "dynamic"',
      },
      {
        name: 'a generated metadata ID below a dynamic parent',
        parents: [{}],
        ids: [{ id: 'generated' }],
        mode: 'dynamic',
        expected:
          'cannot prerender parameter "__metadata_id__" because parameter "parent" is configured as "dynamic"',
      },
    ])('rejects $name', async ({ parents, ids, mode, expected }) => {
      const file = 'app/validation/[parent]/opengraph-image.tsx'
      const source = await next.readFile(file)
      await next.patchFile(
        file,
        source
          .replace(
            "return [{ parent: 'allowed' }]",
            `return ${JSON.stringify(parents)}`
          )
          .replace('return []', `return ${JSON.stringify(ids)}`)
          .replace("parent: 'not-found'", `parent: '${mode}'`),
        async () => {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).toBe(1)
          expect(cliOutput).toContain(expected)
        }
      )
    })
  })
})
