import { createHash } from 'crypto'
import { RouteKind } from 'next/dist/server/route-kind'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'

type State = {
  route: string
  params: { id?: string; slug?: string[] }
  locale: string | null
  generation: string
}

// Distinct URLs deliberately normalize to the same old incremental-cache key.
// The alternative fix must cache both owners successfully, not reject one.
const collisions = [
  ['/%70ages-victim', '/pages-victim', 'pages-catchall', 'pages-victim'],
  ['/fr/%70ages-victim', '/fr/pages-victim', 'pages-catchall', 'pages-victim'],
  ['/%61pp-victim', '/app-victim', 'pages-catchall', 'app-victim'],
  ['/app-only/%76ictim', '/app-only/victim', 'app-catchall', 'app-only-victim'],
  ['/%61pi/victim', '/api/victim', 'pages-catchall', 'route-victim'],
]

describe.each(['default', 'disk', 'custom'])(
  'route-scoped-cache (%s)',
  (storage) => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      env: { CACHE_STORAGE: storage },
    })

    async function read(pathname: string) {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(200)
      const body = await response.text()
      const state: State = response.headers
        .get('content-type')
        ?.includes('application/json')
        ? JSON.parse(body)
        : JSON.parse(load(body)('#route-state').text())
      expect(state.generation).toEqual(expect.any(String))
      return { state, response }
    }

    async function expectOwner(pathname: string, route: string, id?: string) {
      const result = await read(pathname)
      expect(result.state.route).toBe(route)
      if (id !== undefined) expect(result.state.params.id).toBe(id)
      return result
    }

    async function dataPath(pathname: string) {
      const $ = await next.render$('/pages-victim/known')
      const { buildId } = JSON.parse($('#__NEXT_DATA__').text())
      return `/_next/data/${buildId}${pathname}.json`
    }

    async function readStaticPage(pathname: string) {
      const manifest = await next.readJSON('.next/server/pages-manifest.json')
      const filename = manifest[pathname === '/' ? '/en' : `/en${pathname}`]
      expect(typeof filename).toBe('string')
      return next.readFile(`.next/server/${filename}`)
    }

    it('normal: caches build-time and runtime entries from a long Unicode source', async () => {
      for (const id of ['known', 'runtime']) {
        const pathname = `/source-hash/${id}`
        const first = await expectOwner(pathname, 'app-long-source', id)
        expect((await read(pathname)).state).toEqual(first.state)
        if (!isNextDeploy) {
          // The ASCII suffix avoids an unrelated Turbopack UTF-8 chunk-name
          // truncation bug while the encoded source still exceeds NAME_MAX.
          const source = `/(${'é'.repeat(40)}${'a'.repeat(80)})/source-hash/[id]/page`
          const artifact = next.getPrerenderFilePath(pathname, '.html', {
            route: { kind: RouteKind.APP_PAGE, sourceRoute: source },
          })
          expect(await next.readFile(artifact)).toContain(
            first.state.generation
          )
        }
      }
    })

    it('normal: emits verified prerender seeds at historical paths', async () => {
      if (isNextDeploy) {
        await expectOwner('/pages-victim/known', 'pages-victim', 'known')
        await expectOwner('/app-victim/known', 'app-victim', 'known')
        await expectOwner('/api/victim/known', 'route-victim', 'known')
        return
      }
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      expect(manifest).not.toHaveProperty('cacheKeys')
      for (const [pathname, router, extensions] of [
        ['/en/pages-victim/known', 'pages', ['.html', '.json', '.meta']],
        ['/fr/pages-victim/known', 'pages', ['.html', '.json', '.meta']],
        ['/en/pages-fallback/[id]', 'pages', ['.html', '.meta']],
        ['/fr/pages-fallback/[id]', 'pages', ['.html', '.meta']],
        ['/app-victim/known', 'app', ['.html', '.rsc', '.meta']],
        ['/grouped/known', 'app', ['.html', '.rsc', '.meta']],
        ['/api/victim/known', 'app', ['.body', '.meta']],
      ] as const) {
        for (const extension of extensions) {
          expect(
            await next.hasFile(
              next.getPrerenderFilePath(pathname, extension, { router })
            )
          ).toBe(true)
        }
        const metadata = await next.readJSON(
          next.getPrerenderFilePath(pathname, '.meta', { router })
        )
        expect(metadata.routeCache).toEqual(
          expect.objectContaining({
            key: expect.stringMatching(/^\/route-cache\//),
            owner: expect.objectContaining({ sourceRoute: expect.any(String) }),
            isFallback: expect.any(Boolean),
          })
        )
      }

      for (const {
        artifactPath,
        requestPath,
        router,
        extension,
        expectedOwner,
      } of [
        {
          artifactPath: '/en/pages-victim/known',
          requestPath: '/pages-victim/known',
          router: 'pages',
          extension: '.html',
          expectedOwner: 'pages-victim',
        },
        {
          artifactPath: '/grouped/known',
          requestPath: '/grouped/known',
          router: 'app',
          extension: '.html',
          expectedOwner: 'app-grouped',
        },
        {
          artifactPath: '/api/victim/known',
          requestPath: '/api/victim/known',
          router: 'app',
          extension: '.body',
          expectedOwner: 'route-victim',
        },
      ] as const) {
        const historicalPath = next.getPrerenderFilePath(
          artifactPath,
          extension,
          { router }
        )
        const seed = await next.readFile(historicalPath)
        const first = await expectOwner(requestPath, expectedOwner, 'known')
        expect(seed).toContain(first.state.generation)
        const metadata = await next.readJSON(
          next.getPrerenderFilePath(artifactPath, '.meta', { router })
        )
        expect(
          await next.readFile(
            next.getPrerenderFilePath(artifactPath, extension, {
              route: metadata.routeCache.owner,
            })
          )
        ).toBe(seed)
      }
    })

    it('normal: runtime regeneration writes only scoped artifacts', async () => {
      const pathname = '/pages-victim/known'
      const before = await expectOwner(pathname, 'pages-victim')
      const legacyPath = '.next/server/pages/en/pages-victim/known.html'
      const legacySeed = isNextDeploy
        ? undefined
        : await next.readFile(legacyPath)
      if (!isNextDeploy) {
        expect(legacySeed).toContain(before.state.generation)
      }
      const revalidate = await next.fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname }),
      })
      expect(revalidate.status).toBe(200)
      await retry(async () => {
        const after = await expectOwner(pathname, 'pages-victim')
        expect(after.state.generation).not.toBe(before.state.generation)
        if (!isNextDeploy) {
          expect(await next.readFile(legacyPath)).toBe(legacySeed)
          expect(
            await next.readFile(
              next.getPrerenderFilePath('/en/pages-victim/known', '.html', {
                route: {
                  kind: RouteKind.PAGES,
                  sourceRoute: '/pages-victim/[id]',
                },
              })
            )
          ).toContain(after.state.generation)
        }
      })
    })

    it.each(['', '/fr'])(
      'normal: retains static Pages ownership and lifetime for locale %s',
      async (locale) => {
        const { response, state } = await expectOwner(
          `${locale}/static-isr`,
          'pages-static-isr'
        )
        expect(state.locale).toBe(locale ? 'fr' : 'en')
        const repeated = await expectOwner(
          `${locale}/static-isr`,
          'pages-static-isr'
        )
        expect(repeated.state).toEqual(state)
        expect((await next.fetch(`${locale}/static-not-found`)).status).toBe(
          404
        )
        if (!isNextDeploy) {
          expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
          expect(response.headers.get('cache-control')).toContain(
            's-maxage=31536000'
          )
        }
      }
    )

    it.each([
      ['/app-dynamic', 'app-dynamic-catchall', 'app-dynamic-sibling'],
      ['/api-dynamic', 'route-dynamic-catchall', 'route-dynamic-sibling'],
    ])(
      'normal: preserves dynamic rendering when a sibling prerender exists for %s',
      async (prefix, owner, sibling) => {
        const canonical = await expectOwner(`${prefix}/sibling`, sibling)
        const alias = `${prefix}/%73ibling`
        const first = await read(alias)
        const second = await read(alias)
        if (isNextDeploy && first.state.route === sibling) {
          expect(second.state).toEqual(first.state)
        } else {
          expect(first.state.route).toBe(owner)
          expect(second.state.route).toBe(owner)
          expect(second.state.generation).not.toBe(first.state.generation)
        }
        expect((await read(`${prefix}/sibling`)).state).toEqual(canonical.state)
      }
    )

    for (const [prefix, closed, sibling, formats] of [
      [
        '/api-admission',
        'route-admission-closed',
        'route-admission-sibling',
        ['GET', 'HEAD'],
      ],
      [
        '/app-admission',
        'app-admission-closed',
        'app-admission-sibling',
        ['GET', 'RSC'],
      ],
    ] as const) {
      it(`normal: preserves the App publication allowlist for ${prefix}`, async () => {
        await expectOwner(`${prefix}/allowed`, closed)
        expect((await next.fetch(`${prefix}/not-found`)).status).toBe(404)
        await expectOwner(`${prefix}/sibling/published`, sibling, 'published')
        expect((await next.fetch(`${prefix}/sibling/not-found`)).status).toBe(
          404
        )
      })

      it.each(
        ['published', 'not-found'].flatMap((id) =>
          formats.map((format) => [id, format])
        )
      )(
        `security: App publication allowlist for ${prefix} cannot borrow sibling admission (%s, %s)`,
        async (id, format) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            const response = await next.fetch(`${prefix}/%73ibling/${id}`, {
              method: format === 'HEAD' ? 'HEAD' : 'GET',
              headers: format === 'RSC' ? { RSC: '1' } : {},
            })
            if (isNextDeploy && response.status === 404) continue
            expect(response.status).toBe(200)
            expect(response.headers.get('x-fixture-route')).not.toBe(closed)
            if (format !== 'HEAD') {
              const body = await response.text()
              expect(body).not.toContain(closed)
              expect(
                body.includes('pages-catchall') ||
                  (isNextDeploy && body.includes(sibling))
              ).toBe(true)
            }
          }
        }
      )
    }

    it.each([
      ['/pages-victim/known', 'pages-victim'],
      ['/fr/pages-victim/known', 'pages-victim'],
      ['/app-victim/known', 'app-victim'],
      ['/app-only/victim/known', 'app-only-victim'],
      ['/api/victim/known', 'route-victim'],
      ['/grouped/known', 'app-grouped'],
      ['/pages-fallback/known', 'pages-fallback'],
      ['/fr/pages-fallback/known', 'pages-fallback'],
    ])(
      'normal: reads the build-time response for %s',
      async (pathname, route) => {
        const first = await expectOwner(pathname, route, 'known')
        const second = await expectOwner(pathname, route, 'known')
        expect(second.state.generation).toBe(first.state.generation)
        if (!isNextDeploy)
          expect(first.response.headers.get('x-nextjs-cache')).toBe('HIT')
      }
    )

    it.each([
      ['/pages-fallback', 'en'],
      ['/fr/pages-fallback', 'fr'],
    ])(
      'normal: serves the fallback shell and then data for %s',
      async (prefix, locale) => {
        const pathname = `${prefix}/fallback-runtime`
        const response = await next.fetch(pathname)
        expect(response.status).toBe(200)
        const $ = load(await response.text())
        const data = JSON.parse($('#__NEXT_DATA__').text())
        if (!isNextDeploy) {
          // The platform may complete a fallback before sending its response.
          // next start serves the build-time fallback HTML on the initial request.
          expect(data.isFallback).toBe(true)
          expect($('#fallback').text()).toBe('Loading')
        }
        const result = await next.fetch(
          await dataPath(`/${locale}/pages-fallback/fallback-runtime`)
        )
        expect(result.status).toBe(200)
        expect((await result.json()).pageProps).toMatchObject({
          route: 'pages-fallback',
          params: { id: 'fallback-runtime' },
          locale,
        })
        const ready = await expectOwner(
          pathname,
          'pages-fallback',
          'fallback-runtime'
        )
        expect(ready.state.locale).toBe(locale)
        expect((await expectOwner(pathname, 'pages-fallback')).state).toEqual(
          ready.state
        )
      }
    )

    it.each([
      ['/pages-victim', 'pages-victim'],
      ['/app-victim', 'app-victim'],
      ['/api/victim', 'route-victim'],
    ])(
      'normal: caches a runtime-generated response for %s',
      async (prefix, route) => {
        const path = `${prefix}/normal-runtime`
        const first = await expectOwner(path, route, 'normal-runtime')
        const hit = await expectOwner(path, route, 'normal-runtime')
        expect(hit.state.generation).toBe(first.state.generation)
        if (!isNextDeploy) {
          expect(first.response.headers.get('x-nextjs-cache')).toBe('MISS')
          expect(hit.response.headers.get('x-nextjs-cache')).toBe('HIT')
        }
      }
    )

    it('normal: separates locale variants', async () => {
      const en = await read('/pages-victim/locale')
      const fr = await read('/fr/pages-victim/locale')
      expect(en.state.locale).toBe('en')
      expect(fr.state.locale).toBe('fr')
      expect(en.state.generation).not.toBe(fr.state.generation)
      expect((await read('/pages-victim/locale')).state).toEqual(en.state)
      expect((await read('/fr/pages-victim/locale')).state).toEqual(fr.state)
    })

    it.each(['a%2Fb', 'a%252Fb', 'caf%C3%A9', 'with%20space'])(
      'normal: preserves an encoded parameter %s',
      async (encoded) => {
        const path = `/pages-victim/${encoded}`
        const first = await expectOwner(
          path,
          'pages-victim',
          decodeURIComponent(encoded)
        )
        const second = await read(path)
        expect(second.state).toEqual(first.state)
      }
    )

    it('normal: shares HTML and Pages data for the same route and locale', async () => {
      const pathname = '/fr/pages-victim/html-data'
      const html = await read(pathname)
      const data = await next.fetch(await dataPath(pathname))
      expect(data.status).toBe(200)
      expect((await data.json()).pageProps).toEqual(html.state)
    })

    it('normal: shares RSC and HTML for the same App route', async () => {
      const { state } = await expectOwner('/app-victim/html-rsc', 'app-victim')
      const rsc = await next.fetch('/app-victim/html-rsc', {
        headers: { RSC: '1' },
      })
      expect(rsc.status).toBe(200)
      expect(rsc.headers.get('content-type')).toContain('text/x-component')
      expect(await rsc.text()).toContain(state.generation)
    })

    it('normal: preserves rewrites, query handling and trailing-slash redirects', async () => {
      const direct = await read('/pages-victim/rewritten')
      expect((await read('/rewritten/rewritten')).state).toEqual(direct.state)
      expect((await read('/pages-victim/rewritten?ignored=1')).state).toEqual(
        direct.state
      )
      const redirect = await next.fetch('/pages-victim/rewritten/', {
        redirect: 'manual',
      })
      expect(redirect.status).toBe(308)
      expect(redirect.headers.get('location')).toBe('/pages-victim/rewritten')
    })

    it('normal: keeps redirects and negative responses cacheable', async () => {
      for (let i = 0; i < 2; i++) {
        const redirect = await next.fetch('/pages-victim/redirect', {
          redirect: 'manual',
        })
        expect(redirect.status).toBe(307)
        expect(redirect.headers.get('location')).toBe('/pages-victim/known')
        expect((await next.fetch('/pages-victim/missing-normal')).status).toBe(
          404
        )
        expect((await next.fetch('/pages-closed/not-found')).status).toBe(404)
      }
    })

    it.each([
      ['/pages-closed/known', 'pages-closed'],
      ['/app-closed/known', 'app-closed'],
      ['/app-only/closed/known', 'app-only-closed'],
    ])(
      'normal: serves a listed fallback:false path %s',
      async (pathname, route) => {
        await expectOwner(pathname, route, 'known')
      }
    )

    it.each(['', '/fr'])(
      'normal: preserves the closed catch-all allowlist for locale %s',
      async (locale) => {
        const allowed = await expectOwner(
          `${locale}/closed/allowed`,
          'pages-closed-catchall'
        )
        expect(allowed.state.params.slug).toEqual(['allowed'])
        expect(allowed.state.locale).toBe(locale ? 'fr' : 'en')
        expect((await next.fetch(`${locale}/closed/not-found`)).status).toBe(
          404
        )
        await expectOwner(
          `${locale}/closed/sibling/published`,
          'pages-admission-sibling',
          'published'
        )
        expect(
          (await next.fetch(`${locale}/closed/sibling/not-found`)).status
        ).toBe(404)
      }
    )

    it.each(
      ['', '/fr'].flatMap((locale) =>
        ['published', 'not-found'].flatMap((id) =>
          ['html', 'data'].map((format) => [locale, id, format])
        )
      )
    )(
      'security: a closed catch-all cannot borrow sibling admission (%s, %s, %s)',
      async (locale, id, format) => {
        const pathname = `${locale}/closed/%73ibling/${id}`
        const requestPath =
          format === 'data'
            ? await dataPath(`${locale || '/en'}/closed/%73ibling/${id}`)
            : pathname
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await next.fetch(requestPath)
          if (isNextDeploy && response.status === 404) continue
          expect(response.status).toBe(200)
          const body = await response.text()
          const state: State = response.headers
            .get('content-type')
            ?.includes('application/json')
            ? JSON.parse(body).pageProps
            : JSON.parse(load(body)('#route-state').text())
          // A platform may canonicalize the alias before invoking a route.
          // Neither routing choice may admit the closed catch-all's excluded
          // parameters using the sibling's positive or negative prerender.
          expect(
            isNextDeploy
              ? ['pages-catchall', 'pages-admission-sibling']
              : ['pages-catchall']
          ).toContain(state.route)
        }
      }
    )

    it.each([
      ['/pages-closed/unlisted', 'pages-catchall'],
      ['/app-closed/unlisted', 'pages-catchall'],
      ['/app-only/closed/unlisted', 'app-catchall'],
    ])(
      'normal: honors route admission before a cache read for %s',
      async (pathname, route) => {
        if (isNextDeploy) {
          // The deployed router may terminate a fallback:false route at the
          // function boundary instead of applying next start's route fall-through.
          const response = await next.fetch(pathname)
          expect([200, 404]).toContain(response.status)
          if (response.status === 200) await expectOwner(pathname, route)
        } else {
          const first = await expectOwner(pathname, route)
          expect((await expectOwner(pathname, route)).state).toEqual(
            first.state
          )
        }
      }
    )

    it.each([
      ['/pages-victim/fast-normal', 'pages-victim'],
      ['/app-fast/normal', 'app-fast'],
    ])('normal: regenerates a stale entry for %s', async (pathname, route) => {
      const first = await expectOwner(pathname, route)
      await retry(async () => {
        const refreshed = await expectOwner(pathname, route)
        expect(refreshed.state.generation).not.toBe(first.state.generation)
      })
    })

    it.each([
      ['/pages-victim/on-demand', '/api/revalidate', 'pages-victim'],
      ['/fr/pages-victim/on-demand', '/api/revalidate', 'pages-victim'],
      ['/app-victim/on-demand', '/api/revalidate-app', 'app-victim'],
    ])(
      'normal: revalidates %s through its public pathname',
      async (pathname, endpoint, route) => {
        const first = await expectOwner(pathname, route)
        const response = await next.fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathname }),
        })
        expect(response.status).toBe(200)
        await retry(async () => {
          const current = await expectOwner(pathname, route)
          expect(current.state.generation).not.toBe(first.state.generation)
        })
      }
    )

    it('normal: only-generated revalidation does not create an absent entry', async () => {
      const pathname = '/pages-victim/only-generated'
      const response = await next.fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname, onlyGenerated: true }),
      })
      expect(response.status).toBe(200)
      const first = await expectOwner(
        pathname,
        'pages-victim',
        'only-generated'
      )
      if (!isNextDeploy)
        expect(first.response.headers.get('x-nextjs-cache')).toBe('MISS')
      expect((await read(pathname)).state).toEqual(first.state)
    })

    it('normal: serves static pages and public files', async () => {
      expect(await next.render('/')).toContain('static-home')
      expect(await next.render('/route')).toContain('static-route')
      expect(await next.render('/plain.txt')).toBe('public-file\n')
    })

    for (const [
      aliasPrefix,
      canonicalPrefix,
      aliasOwner,
      canonicalOwner,
    ] of collisions) {
      it.each(['cold', 'warm', 'seed-cold', 'seed-warm'])(
        `security: isolates ${canonicalPrefix} in %s order`,
        async (order) => {
          const id = order.startsWith('seed-') ? order : `collision-${order}`
          const alias = `${aliasPrefix}/${id}`
          const canonical = `${canonicalPrefix}/${id}`
          if (order.endsWith('warm'))
            await expectOwner(canonical, canonicalOwner, id)
          // Vercel already scopes by selected route, and may canonicalize an
          // encoded path before invoking it. Both selections are valid there;
          // next start must render its selected catch-all successfully.
          const encoded = await read(alias)
          expect(
            isNextDeploy ? [aliasOwner, canonicalOwner] : [aliasOwner]
          ).toContain(encoded.state.route)
          const ordinary = await expectOwner(canonical, canonicalOwner, id)
          const again = await read(alias)
          expect(again.state.route).toBe(encoded.state.route)
          expect(again.state.generation).toBe(encoded.state.generation)
          expect((await read(canonical)).state).toEqual(ordinary.state)
          if (encoded.state.route === aliasOwner)
            expect(encoded.state.generation).not.toBe(ordinary.state.generation)
        }
      )
    }

    it('security: keeps cache lifetimes independent for the same legacy key', async () => {
      const aliasPath = '/%70ages-victim/fast-lifetimes'
      const canonicalPath = '/pages-victim/fast-lifetimes'
      const longLived = await read(aliasPath)
      const shortLived = await expectOwner(
        canonicalPath,
        'pages-victim',
        'fast-lifetimes'
      )
      await retry(async () => {
        const refreshed = await expectOwner(
          canonicalPath,
          'pages-victim',
          'fast-lifetimes'
        )
        expect(refreshed.state.generation).not.toBe(shortLived.state.generation)
      })
      const alias = await read(aliasPath)
      if (!isNextDeploy) {
        expect(alias.response.headers.get('x-nextjs-cache')).toBe('HIT')
        expect(alias.state).toEqual(longLived.state)
      } else {
        expect(['pages-catchall', 'pages-victim']).toContain(alias.state.route)
      }
    })

    it('security: on-demand revalidation updates only the selected Pages route', async () => {
      const aliasPath = '/%70ages-victim/invalidation-scope'
      const canonicalPath = '/pages-victim/invalidation-scope'
      const alias = await read(aliasPath)
      const before = await expectOwner(
        canonicalPath,
        'pages-victim',
        'invalidation-scope'
      )
      const response = await next.fetch('/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname: canonicalPath }),
      })
      expect(response.status).toBe(200)
      await retry(async () => {
        const current = await expectOwner(
          canonicalPath,
          'pages-victim',
          'invalidation-scope'
        )
        expect(current.state.generation).not.toBe(before.state.generation)
      })
      const currentAlias = await read(aliasPath)
      if (!isNextDeploy || alias.state.route === 'pages-catchall')
        expect(currentAlias.state).toEqual(alias.state)
      else expect(currentAlias.state.route).toBe('pages-victim')
    })

    it('security: separates simultaneous writes by two owners', async () => {
      await Promise.all([
        read('/%70ages-victim/concurrent'),
        expectOwner('/pages-victim/concurrent', 'pages-victim', 'concurrent'),
      ])
      const alias = await read('/%70ages-victim/concurrent')
      expect(
        isNextDeploy ? ['pages-catchall', 'pages-victim'] : ['pages-catchall']
      ).toContain(alias.state.route)
      await expectOwner(
        '/pages-victim/concurrent',
        'pages-victim',
        'concurrent'
      )
    })

    it('security: isolates Pages data requests from the sibling route', async () => {
      const alias = await next.fetch(
        await dataPath('/en/%70ages-victim/data-collision')
      )
      expect(alias.status).toBe(200)
      const encodedState = (await alias.json()).pageProps
      expect(
        isNextDeploy ? ['pages-catchall', 'pages-victim'] : ['pages-catchall']
      ).toContain(encodedState.route)
      const ordinary = await expectOwner(
        '/pages-victim/data-collision',
        'pages-victim',
        'data-collision'
      )
      const data = await next.fetch(
        await dataPath('/en/pages-victim/data-collision')
      )
      expect(data.status).toBe(200)
      expect((await data.json()).pageProps).toEqual(ordinary.state)
    })

    it.each(['missing-cold', 'missing-warm'])(
      'security: scopes runtime negative entries (%s)',
      async (id) => {
        const canonical = `/pages-victim/${id}`
        if (id.endsWith('warm'))
          expect((await next.fetch(canonical)).status).toBe(404)
        const alias = await next.fetch(`/%70ages-victim/${id}`)
        if (isNextDeploy && alias.status === 404) {
          expect((await next.fetch(canonical)).status).toBe(404)
        } else {
          expect(alias.status).toBe(200)
          expect(
            JSON.parse(load(await alias.text())('#route-state').text()).route
          ).toBe('pages-catchall')
          expect((await next.fetch(canonical)).status).toBe(404)
          await expectOwner(`/%70ages-victim/${id}`, 'pages-catchall')
        }
      }
    )

    it('security: scopes the build-time notFoundRoutes entry to its owner', async () => {
      expect((await next.fetch('/pages-closed/not-found')).status).toBe(404)
      const alias = await next.fetch('/%70ages-closed/not-found')
      if (isNextDeploy && alias.status === 404) {
        expect((await next.fetch('/pages-closed/not-found')).status).toBe(404)
      } else {
        expect(alias.status).toBe(200)
        expect(
          JSON.parse(load(await alias.text())('#route-state').text()).route
        ).toBe('pages-catchall')
        expect((await next.fetch('/pages-closed/not-found')).status).toBe(404)
      }
    })

    it('security: allows /index without replacing the static homepage', async () => {
      const original = isNextDeploy ? undefined : await readStaticPage('/')
      expect(await next.render('/')).toContain('static-home')
      if (isNextDeploy) {
        // Vercel can normalize /index to the static homepage before invocation.
        expect((await next.fetch('/index')).status).toBe(200)
      } else {
        await expectOwner('/index', 'pages-catchall')
      }
      expect(await next.render('/')).toContain('static-home')
      if (!isNextDeploy) expect(await readStaticPage('/')).toBe(original)
    })

    it('security: allows a Unicode pathname that the catch-all accepts', async () => {
      const original = isNextDeploy
        ? undefined
        : await readStaticPage('/café/post')
      const result = await next.fetch('/caf%C3%A9/post')
      expect(result.status).toBe(200)
      if (!isNextDeploy) {
        const state = JSON.parse(
          load(await result.text())('#route-state').text()
        )
        expect(state.route).toBe('pages-catchall')
        expect(state.params.slug).toEqual(['café', 'post'])
        expect(await readStaticPage('/café/post')).toBe(original)
      }
    })

    it('security: preserves independent entries across a process restart', async () => {
      const canonical = '/pages-victim/restart'
      const before = await expectOwner(canonical, 'pages-victim', 'restart')
      const alias = await read('/%70ages-victim/restart')
      if (!isNextDeploy) {
        await next.stop()
        await next.start({ skipBuild: true })
      }
      // On a deployment these are platform-cache persistence assertions;
      // local modes additionally discard every in-process cache above.
      expect(
        (await expectOwner(canonical, 'pages-victim', 'restart')).state
      ).toEqual(before.state)
      expect((await read('/%70ages-victim/restart')).state).toEqual(alias.state)
      expect(
        isNextDeploy ? ['pages-catchall', 'pages-victim'] : ['pages-catchall']
      ).toContain(alias.state.route)
    })

    if (storage === 'custom') {
      it('handler contract: exposes a bounded route namespace and readable pathname', async () => {
        const first = await expectOwner(
          '/pages-victim/handler-readable',
          'pages-victim',
          'handler-readable'
        )
        expect((await read('/pages-victim/handler-readable')).state).toEqual(
          first.state
        )
        if (isNextDeploy) return // Platform ISR owns persistence in minimal mode.
        const operations = (await next.readFile('cache-operations.jsonl'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        const write = operations.find(
          (op) => op.operation === 'set' && op.params?.id === 'handler-readable'
        )
        expect(write).toBeDefined()
        expect(operations.every((op) => op.hasRouteContext === false)).toBe(
          true
        )
        expect(typeof write.key).toBe('string')
        expect(write.key).toBe(
          `/route-cache/PAGES/${createHash('sha256').update('/pages-victim/[id]').digest('hex')}/$/en/pages-victim/handler-readable`
        )
        expect(
          operations.some(
            (op) => op.operation === 'get' && op.key === write.key
          )
        ).toBe(true)
      })

      it('handler contract: supplies distinct opaque keys for source routes', async () => {
        await read('/%70ages-victim/handler-key')
        await read('/pages-victim/handler-key')
        if (isNextDeploy) {
          // Platform ISR owns persistence in minimal mode; the self-hosted
          // handler need not receive writes. Verify platform route isolation.
          await expectOwner(
            '/pages-victim/handler-key',
            'pages-victim',
            'handler-key'
          )
          return
        }
        const operations = (await next.readFile('cache-operations.jsonl'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        const writes = operations.filter(
          (op) =>
            op.operation === 'set' &&
            JSON.stringify(op.params || {}).includes('handler-key')
        )
        const victim = writes.find((op) => op.route === 'pages-victim')
        const catchall = writes.find((op) => op.route === 'pages-catchall')
        expect(victim).toBeDefined()
        expect(catchall).toBeDefined()
        expect(victim.key).not.toBe(catchall.key)
        expect(victim.key).toBe(
          `/route-cache/PAGES/${createHash('sha256').update('/pages-victim/[id]').digest('hex')}/$/en/pages-victim/handler-key`
        )
        expect(catchall.key).toBe(
          `/route-cache/PAGES/${createHash('sha256').update('/[...slug]').digest('hex')}/$/en/pages-victim/handler-key`
        )
        expect(
          operations.some(
            (op) => op.operation === 'get' && op.key === victim.key
          )
        ).toBe(true)
      })
    }
  }
)

describe.each([false, true])(
  'route-scoped-cache with trailingSlash (skip redirect: %s)',
  (skipRedirect) => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      env: {
        TRAILING_SLASH: '1',
        SKIP_TRAILING_SLASH_REDIRECT: skipRedirect ? '1' : '0',
      },
    })

    it.each([
      '/pages-victim/known/',
      '/fr/pages-victim/known/',
      '/app-victim/known/',
      '/api/victim/known/',
      '/pages-victim/trailing-runtime/',
      '/app-victim/trailing-runtime/',
      '/api/victim/trailing-runtime/',
    ])(
      'preserves the response and its cache lifetime for %s',
      async (pathname) => {
        const first = await next.fetch(pathname)
        expect(first.status).toBe(200)
        const firstBody = await first.text()
        const state = first.headers
          .get('content-type')
          ?.includes('application/json')
          ? JSON.parse(firstBody)
          : JSON.parse(load(firstBody)('#route-state').text())
        const second = await next.fetch(pathname)
        expect(second.status).toBe(200)
        expect(await second.text()).toContain(state.generation)
        if (!isNextDeploy) {
          expect(second.headers.get('x-nextjs-cache')).toBe('HIT')
          expect(second.headers.get('cache-control')).toContain('s-maxage=3600')
          if (pathname.endsWith('/known/')) {
            expect(first.headers.get('x-nextjs-cache')).toBe('HIT')
          }
        }
      }
    )
  }
)
