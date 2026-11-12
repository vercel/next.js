import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'
import { join } from 'node:path'

describe('route-handler-param-matching', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])(
    'applies closed tuple admission before %s invokes the handler',
    async (method) => {
      const valid = await next.fetch('/closed/en/first', { method })
      expect(valid.status).toBe(200)
      expect(valid.headers.get('x-handler-method')).toBe(method)
      const outputStart = next.cliOutput.length
      for (const pathname of [
        '/closed/en/second',
        '/closed/es/first',
        '/closed/fr/first',
      ]) {
        const rejected = await next.fetch(pathname, { method })
        expect(rejected.status).toBe(404)
        expect(rejected.headers.get('x-handler-method')).toBeNull()
      }
      expect(next.cliOutput.slice(outputStart)).not.toContain('handler-called:')
    }
  )

  it('keeps dynamic GET responses dynamic after closing their parameters', async () => {
    for (const value of ['first', 'second']) {
      const response = await next.fetch('/request-time/allowed', {
        headers: { cookie: `request-value=${value}` },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        params: { slug: 'allowed' },
        cookie: value,
      })
    }
    const outputStart = next.cliOutput.length
    expect((await next.fetch('/request-time/unknown')).status).toBe(404)
    expect(next.cliOutput.slice(outputStart)).not.toContain('handler-called:')
  })

  it('admits arbitrary dynamic suffixes while preserving inner use-cache', async () => {
    const first = await next.fetch('/prefix/en/first', {
      headers: { cookie: 'request-value=first' },
    })
    const second = await next.fetch('/prefix/en/second', {
      headers: { cookie: 'request-value=second' },
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(firstBody.params).toEqual({ lang: 'en', slug: 'first' })
    expect(secondBody.params).toEqual({ lang: 'en', slug: 'second' })
    expect(firstBody.cookie).toBe('first')
    expect(secondBody.cookie).toBe('second')
    expect(firstBody.cached).toEqual(secondBody.cached)
    expect((await next.fetch('/prefix/fr/first')).status).toBe(404)
  })

  it.each(['日本語', '100%', 'with space', 'a/b', '[id]', 'a[x]b'])(
    'matches an encoded closed prefix exactly once: %s',
    async (lang) => {
      const path = `/prefix/${encodeURIComponent(lang)}/arbitrary`
      const response = await next.fetch(path)
      expect(response.status).toBe(200)
      expect((await response.json()).params).toEqual({
        lang,
        slug: 'arbitrary',
      })
    }
  )

  it('keeps dynamic bodies dynamic with mixed incomplete and complete inferred tuples', async () => {
    for (const [lang, slug] of [
      ['en', 'new'],
      ['ja', 'seed'],
      ['ja', 'new'],
    ]) {
      for (const value of ['first', 'second']) {
        const response = await next.fetch(`/mixed/${lang}/${slug}`, {
          headers: { cookie: `request-value=${value}` },
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          params: { lang, slug },
          cookie: value,
        })
      }
    }
    const outputStart = next.cliOutput.length
    expect((await next.fetch('/mixed/fr/new')).status).toBe(404)
    expect(next.cliOutput.slice(outputStart)).not.toContain('handler-called:')
  })

  it('preserves inferred open suffixes at runtime', async () => {
    expect((await next.fetch('/inferred/en/new')).status).toBe(200)
    expect((await next.fetch('/inferred/fr/new')).status).toBe(404)
  })

  it('keeps authored methods separate from a prerendered GET response', async () => {
    expect((await next.fetch('/inferred/en/seed')).status).toBe(200)
    const head = await next.fetch('/inferred/en/seed', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('x-handler-method')).toBe('HEAD')
    expect(await head.text()).toBe('')
    expect(
      (await next.fetch('/inferred/en/seed', { method: 'POST' })).status
    ).toBe(405)
    expect(
      (await next.fetch('/inferred/en/seed', { method: 'OPTIONS' })).status
    ).toBe(204)
  })

  // @force-gate start
  it('preserves adapter dispatch for an inferred open suffix', async () => {
    const report = await next.readJSON('adapter-admission.json')
    const route = report.dynamicRoutes.find(
      (item) => item.source === '/inferred/[lang]/[slug]'
    )
    expect(route).toBeDefined()
    expect(route.conditional).toBe(false)
    expect(route.destination).toContain('nxtPlang=$nxtPlang')
    expect(route.destination).toContain('nxtPslug=$nxtPslug')
    expect(
      report.prerenders.find(
        (item) => item.pathname === '/inferred/[lang]/[slug]'
      ).allowQuery
    ).toEqual(expect.arrayContaining(['nxtPlang', 'nxtPslug']))
    expect(new RegExp(route.sourceRegex).test('/inferred/en/new')).toBe(true)
    expect(report.admission['/inferred/[lang]/[slug]'].tuples).toEqual([['en']])
  })

  it('uses the rewrite destination for admission', async () => {
    expect((await next.fetch('/rewritten/en/novel')).status).toBe(200)
    expect((await next.fetch('/rewritten/fr/novel')).status).toBe(404)
  })

  it('preserves catch-all and optional catch-all tuple membership', async () => {
    for (const path of [
      '/catch/a/b',
      '/catch/100%25/a%2Fb',
      '/catch/a%2Cb/c',
      '/catch/a/b%2Cc',
      '/optional',
      '/optional/one/two',
    ]) {
      expect((await next.fetch(path)).status).toBe(200)
    }
    for (const path of [
      '/catch/a',
      '/catch/a/b/c',
      '/optional/one',
      '/optional/other',
    ]) {
      expect((await next.fetch(path)).status).toBe(404)
    }
  })

  it('keeps handler matching independent of page layouts and page coherence', async () => {
    expect((await next.fetch('/page-closed/fr')).status).toBe(404)
    const openApi = await next.fetch('/page-closed/fr/api')
    expect(openApi.status).toBe(200)
    expect((await openApi.json()).params).toEqual({ lang: 'fr' })
    expect((await next.fetch('/api-closed/fr/api')).status).toBe(404)
    const openPage = await next.fetch('/api-closed/fr')
    expect(openPage.status).toBe(200)
    expect(await openPage.text()).toContain('Open page language: ')
  })

  it('allows a user parameter named __metadata_id__ outside metadata routes', async () => {
    expect((await next.fetch('/literal/allowed')).status).toBe(200)
    expect((await next.fetch('/literal/rejected')).status).toBe(404)
    const head = await next.fetch('/literal/allowed', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('x-handler-method')).toBe('GET')
    expect(await head.text()).toBe('')
    const outputStart = next.cliOutput.length
    const rejectedHead = await next.fetch('/literal/rejected', {
      method: 'HEAD',
    })
    expect(rejectedHead.status).toBe(404)
    expect(rejectedHead.headers.get('x-handler-method')).toBeNull()
    expect(next.cliOutput.slice(outputStart)).not.toContain('handler-called:')
    expect((await next.fetch('/robots.txt')).status).toBe(200)
  })

  it('keeps a single-image parent named __metadata_id__ configurable', async () => {
    const image = await next.fetch('/metadata-literal/allowed/opengraph-image')
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(image.headers.get('x-metadata-parent')).toBe('allowed')
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect(
      (await next.fetch('/metadata-literal/rejected/opengraph-image')).status
    ).toBe(404)
  })

  it('keeps parameters authored in metadata-shaped handlers configurable', async () => {
    const response = await next.fetch('/metadata-shaped/sitemap/allowed')
    expect(response.status).toBe(200)
    expect((await response.json()).params).toEqual({
      __metadata_id__: 'allowed',
    })
    expect((await next.fetch('/metadata-shaped/sitemap/rejected')).status).toBe(
      404
    )
  })

  it('applies parent matching to a single-image metadata handler', async () => {
    const image = await next.fetch('/metadata/en/opengraph-image')
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect((await next.fetch('/metadata/fr/opengraph-image')).status).toBe(404)
  })

  // @force-gate start
  it('shares admitted GET cache entries with automatic HEAD', async () => {
    expect((await next.fetch('/literal/allowed')).status).toBe(200)
    const head = await next.fetch('/literal/allowed', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(head.headers.get('x-handler-method')).toBe('GET')
    expect(await head.text()).toBe('')
    expect(
      (await next.fetch('/literal/rejected', { method: 'HEAD' })).status
    ).toBe(404)
  })

  // @force-gate start
  it('keeps dynamic handler bodies out of prerender manifests', async () => {
    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(
      manifest.routeHandlerParamMatching['/prefix/[lang]/[slug]'].paramNames
    ).toEqual(['lang'])
    expect(
      manifest.routeHandlerParamMatching['/prefix/[lang]/[slug]'].tuples
    ).toContainEqual(['en'])
    expect(
      manifest.routeHandlerParamMatching['/mixed/[lang]/[slug]'].tuples
    ).toEqual([['en'], ['ja']])
    for (const prefix of ['/prefix/', '/mixed/']) {
      expect(
        Object.keys(manifest.routes).some((route) => route.startsWith(prefix))
      ).toBe(false)
      expect(
        Object.keys(manifest.dynamicRoutes).some((route) =>
          route.startsWith(prefix)
        )
      ).toBe(false)
    }
  })

  // @force-gate start
  it('enforces matching when an adapter invokes the handler in minimal mode', async () => {
    const port = await findPort()
    const server = await initNextServerScript(
      join(next.testDir, 'server.cjs'),
      /Handler ready/,
      { ...process.env, NODE_ENV: 'production', PORT: String(port) },
      undefined,
      { cwd: next.testDir, shouldRejectOnError: true }
    )
    try {
      const response = await fetchViaHTTP(port, '/prefix/en/new')
      expect(response.status).toBe(200)
      expect((await response.json()).params).toEqual({
        lang: 'en',
        slug: 'new',
      })
      expect((await fetchViaHTTP(port, '/prefix/fr/new')).status).toBe(404)
    } finally {
      await killApp(server)
    }
  })

  // @force-gate start
  it('fails before handler execution if packaged admission metadata is missing', async () => {
    const file = '.next/prerender-manifest.json'
    const original = await next.readFile(file)
    const manifest = JSON.parse(original)
    delete manifest.routeHandlerParamMatching['/prefix/[lang]/[slug]']
    let output = ''
    let server: Awaited<ReturnType<typeof initNextServerScript>> | undefined
    try {
      await next.patchFile(file, JSON.stringify(manifest))
      const port = await findPort()
      server = await initNextServerScript(
        join(next.testDir, 'server.cjs'),
        /Handler ready/,
        { ...process.env, NODE_ENV: 'production', PORT: String(port) },
        undefined,
        {
          cwd: next.testDir,
          shouldRejectOnError: true,
          onStdout(data) {
            output += data
          },
          onStderr(data) {
            output += data
          },
        }
      )
      expect((await fetchViaHTTP(port, '/prefix/en/new')).status).toBe(500)
      expect(output).toContain(
        'missing its parameter matching admission configuration'
      )
      expect(output).not.toContain('handler-called:')
    } finally {
      if (server) await killApp(server)
      await next.patchFile(file, original)
    }
  })

  // @force-gate start
  it('rejects non-GET cache hits when packaged admission metadata is missing', async () => {
    const file = '.next/prerender-manifest.json'
    const original = await next.readFile(file)
    const manifest = JSON.parse(original)
    delete manifest.routeHandlerParamMatching['/inferred/[lang]/[slug]']
    let output = ''
    let server: Awaited<ReturnType<typeof initNextServerScript>> | undefined
    try {
      await next.patchFile(file, JSON.stringify(manifest))
      const port = await findPort()
      server = await initNextServerScript(
        join(next.testDir, 'server.cjs'),
        /Handler ready/,
        {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          TEST_STATIC_HANDLER: '1',
        },
        undefined,
        {
          cwd: next.testDir,
          shouldRejectOnError: true,
          onStdout(data) {
            output += data
          },
          onStderr(data) {
            output += data
          },
        }
      )
      const cached = await fetchViaHTTP(port, '/inferred/en/seed')
      expect(cached.status).toBe(200)
      expect(cached.headers.get('x-nextjs-cache')).toBe('HIT')
      for (const method of ['HEAD', 'POST', 'OPTIONS']) {
        expect(
          (await fetchViaHTTP(port, '/inferred/en/seed', undefined, { method }))
            .status
        ).toBe(500)
      }
      expect(output).toContain(
        'missing its parameter matching admission configuration'
      )
      expect(output).not.toContain('handler-called:')
    } finally {
      if (server) await killApp(server)
      await next.patchFile(file, original)
    }
  })

  // @force-gate start
  it('keeps ordinary cached handler hits lazy', async () => {
    let output = ''
    const port = await findPort()
    const server = await initNextServerScript(
      join(next.testDir, 'server.cjs'),
      /Handler ready/,
      {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        TEST_LAZY_HANDLER: '1',
      },
      undefined,
      {
        cwd: next.testDir,
        shouldRejectOnError: true,
        onStdout(data) {
          output += data
        },
        onStderr(data) {
          output += data
        },
      }
    )
    try {
      const response = await fetchViaHTTP(port, '/lazy/allowed')
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('cached handler')
      expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
      expect(output).not.toContain('lazy-handler-loaded')
    } finally {
      await killApp(server)
    }
  })

  // @force-gate dev
  it('updates admission when HMR changes generated values or removes matching', async () => {
    const file = 'app/request-time/[slug]/route.ts'
    const source = await next.readFile(file)
    try {
      await next.patchFile(
        file,
        source.replace("slug: 'allowed'", "slug: 'changed'")
      )
      await retry(async () => {
        expect((await next.fetch('/request-time/changed')).status).toBe(200)
        expect((await next.fetch('/request-time/allowed')).status).toBe(404)
      })
      await next.patchFile(
        file,
        source.replace(
          "export const unstable_paramMatching = { slug: 'not-found' }",
          ''
        )
      )
      await retry(async () => {
        expect((await next.fetch('/request-time/unknown')).status).toBe(200)
      })
      await next.patchFile(file, source)
      await retry(async () => {
        expect((await next.fetch('/request-time/unknown')).status).toBe(404)
      })
    } finally {
      await next.patchFile(file, source)
    }
  })
})
