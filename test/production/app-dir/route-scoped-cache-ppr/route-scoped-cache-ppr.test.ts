import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'
import { RouteKind } from 'next/dist/server/route-kind'

describe('route-scoped-cache with PPR', () => {
  const { next, isNextDeploy } = nextTestSetup({ files: __dirname })

  async function read(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    const $ = load(await response.text())
    return {
      state: JSON.parse($('#route-state').text()),
      shell: $('#shell').text(),
      dynamic: $('#dynamic-state').text(),
    }
  }

  async function prefetch(pathname: string, segment = '/_full') {
    const response = await next.fetch(pathname, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': segment,
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    return response.text()
  }

  it('normal: emits PPR shells and segments as historical build seeds', async () => {
    const pathname = '/catalog/a/known'
    if (isNextDeploy) {
      expect((await read(pathname)).shell).toBe('catalog-shell')
      expect(await prefetch(pathname)).toContain('catalog-shell')
      return
    }
    expect(
      await next.readJSON('.next/prerender-manifest.json')
    ).not.toHaveProperty('cacheKeys')
    const legacyPath = `.next/server/app${pathname}`
    const metadata = await next.readJSON(
      next.getPrerenderFilePath(pathname, '.meta')
    )
    expect(metadata.segmentPaths.length).toBeGreaterThan(0)
    const extensions = [
      '.html',
      '.meta',
      ...metadata.segmentPaths.map(
        (segment: string) => `.segments${segment}.segment.rsc`
      ),
    ]
    // A postponed PPR render emits segment payloads, not a complete .rsc file.
    expect(metadata.postponed).toBeDefined()
    for (const filename of [`${legacyPath}.rsc`]) {
      await expect(next.readFile(filename)).rejects.toMatchObject({
        code: 'ENOENT',
      })
    }
    for (const extension of extensions) {
      expect(
        await next.hasFile(next.getPrerenderFilePath(pathname, extension))
      ).toBe(true)
    }
    expect(metadata.routeCache).toEqual(
      expect.objectContaining({
        key: expect.stringMatching(/^\/route-cache\//),
        owner: expect.objectContaining({ sourceRoute: expect.any(String) }),
        isFallback: false,
      })
    )

    expect((await read(pathname)).shell).toBe('catalog-shell')
    for (const extension of extensions) {
      expect(
        await next.hasFile(
          next.getPrerenderFilePath(pathname, extension, {
            route: {
              kind: RouteKind.APP_PAGE,
              sourceRoute: '/catalog/[category]/[item]/page',
            },
          })
        )
      ).toBe(true)
    }
  })

  it.each(['known', 'normal-runtime'])(
    'normal: reuses the %s shell and resumes fresh dynamic content',
    async (item) => {
      const path = `/catalog/a/${item}`
      const first = await read(path)
      const hit = await read(path)
      expect(first.state.route).toBe('ppr-catalog')
      expect(first.state.params).toEqual({ category: 'a', item })
      expect(hit.state).toEqual(first.state)
      expect(first.shell).toBe('catalog-shell')
      expect(hit.shell).toBe('catalog-shell')
      expect(first.dynamic).not.toBe('')
      expect(hit.dynamic).not.toBe(first.dynamic)
    }
  )

  it('normal: keeps parameter variants distinct', async () => {
    const a = await read('/catalog/a/params')
    const b = await read('/catalog/b/params')
    expect(a.state.params).toEqual({ category: 'a', item: 'params' })
    expect(b.state.params).toEqual({ category: 'b', item: 'params' })
    expect(a.state.generation).not.toBe(b.state.generation)
  })

  it('normal: serves a partial shell without mixing its dynamic parameters', async () => {
    for (const item of ['one', 'two']) {
      const result = await read(`/shared/a/${item}`)
      expect(result.shell).toBe('shared-shell')
      expect(result.state.route).toBe('ppr-shared')
      expect(result.state.params).toEqual({ category: 'a', item })
    }
    const first = await prefetch('/shared/a/one')
    expect(first).toContain('shared-shell')
    expect(await prefetch('/shared/a/two')).toBe(first)
  })

  it('normal: preserves HTML, RSC navigation, full prefetch and segment prefetch', async () => {
    const pathname = '/catalog/a/known'
    const html = await read(pathname)
    const rsc = await next.fetch(pathname, { headers: { RSC: '1' } })
    expect(rsc.status).toBe(200)
    expect(rsc.headers.get('content-type')).toContain('text/x-component')
    // A dynamic navigation can regenerate use-cache data in this process;
    // its UUID need not equal the data embedded during the build.
    const navigation = await rsc.text()
    expect(navigation).toContain('ppr-catalog')
    expect(navigation).toContain('known')
    expect(navigation).not.toContain('ppr-catchall')
    const shell = await prefetch(pathname)
    expect(shell).toContain('catalog-shell')
    expect(shell).toContain(html.state.generation)
    const tree = await prefetch(pathname, '/_tree')
    expect(tree.length).toBeGreaterThan(0)
    expect(await prefetch(pathname, '/_tree')).toBe(tree)
  })

  it('normal: refreshes a runtime-created shell after its cache lifetime', async () => {
    const first = await read('/catalog/a/fast-runtime')
    await retry(async () => {
      const current = await read('/catalog/a/fast-runtime')
      expect(current.state.route).toBe('ppr-catalog')
      expect(current.state.generation).not.toBe(first.state.generation)
    }, 45000)
  })

  it('normal: revalidates cached data and its route shell through public APIs', async () => {
    const path = '/catalog/a/on-demand'
    const before = await read(path)
    await retry(async () => {
      expect(await prefetch(path)).toContain(before.state.generation)
    })
    const result = await next.fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: 'on-demand' }),
    })
    expect(result.status).toBe(200)
    await retry(async () => {
      const after = await read(path)
      expect(after.state.route).toBe('ppr-catalog')
      expect(after.state.generation).not.toBe(before.state.generation)
      expect(await prefetch(path)).toContain(after.state.generation)
    })
  })

  it('normal: keeps intentionally shared use-cache data shared across routes', async () => {
    const a = await next.render$('/data-a')
    const b = await next.render$('/data-b')
    expect(a('#shared-data').text()).not.toBe('')
    expect(b('#shared-data').text()).toBe(a('#shared-data').text())
  })

  it.each(['cold', 'warm', 'seed-cold', 'seed-warm'])(
    'security: isolates a catalog shell from the catch-all (%s)',
    async (order) => {
      const item = order.startsWith('seed-') ? order : `collision-${order}`
      const canonical = `/catalog/a/${item}`
      const alias = `/%63atalog/a/${item}`
      if (order.endsWith('warm')) {
        expect((await read(canonical)).state.route).toBe('ppr-catalog')
      }
      const encoded = await read(alias)
      expect(
        isNextDeploy ? ['ppr-catchall', 'ppr-catalog'] : ['ppr-catchall']
      ).toContain(encoded.state.route)
      const ordinary = await read(canonical)
      expect(ordinary.state.route).toBe('ppr-catalog')
      expect(ordinary.state.params).toEqual({ category: 'a', item })
      expect(ordinary.shell).toBe('catalog-shell')
      expect((await read(alias)).state.route).toBe(encoded.state.route)
      expect((await read(canonical)).state).toEqual(ordinary.state)
      // The RSC lookup can bypass the normal response-cache entry point.
      expect(await prefetch(canonical)).toContain('catalog-shell')
      expect(await prefetch(canonical)).not.toContain('catchall-shell')
      expect(await prefetch(alias)).toContain(encoded.shell)
      const navigation = await next.fetch(alias, { headers: { RSC: '1' } })
      expect(navigation.status).toBe(200)
      expect(navigation.headers.get('content-type')).toContain(
        'text/x-component'
      )
      expect(await navigation.text()).toContain(encoded.state.route)
    }
  )

  it('security: keeps a shared partial shell with its source route', async () => {
    const alias = await read('/%73hared/a/alias')
    expect(
      isNextDeploy ? ['ppr-catchall', 'ppr-shared'] : ['ppr-catchall']
    ).toContain(alias.state.route)
    for (const item of ['alias', 'sibling']) {
      const result = await read(`/shared/a/${item}`)
      expect(result.shell).toBe('shared-shell')
      expect(result.state.route).toBe('ppr-shared')
      expect(result.state.params).toEqual({ category: 'a', item })
      expect(await prefetch(`/shared/a/${item}`)).toContain('shared-shell')
    }
  })
})
