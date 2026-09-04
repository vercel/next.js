import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'
import { retry } from 'next-test-utils'

type DynamicRoute = {
  fallback: false | null | string
  fallbackSourceRoute?: string
}

type AdapterDynamicRoute = {
  source?: string
  has?: Array<{
    type: string
    key: string
    value?: string
  }>
}

describe('experimental parameter matching', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_PRIVATE_DEBUG_PARAM_MATCHING: '1',
    },
  })

  it('merges layout configuration and lets a page override it', async () => {
    const inherited = await next.fetch('/en/catalog/t1/items/b2')
    expect(inherited.status).toBe(200)
    expect(await inherited.text()).toContain('en/t1/b2')

    const overridden = await next.fetch('/fr/preview/t2/items/b2')
    expect(overridden.status).toBe(200)
    expect(await overridden.text()).toContain('fr/t2/b2')

    expect((await next.fetch('/fr/catalog/t1/items/b1')).status).toBe(404)
  })

  it('supports uniform policies and permanently dynamic suffixes', async () => {
    for (const [pathname, text] of [
      ['/fallback-only/t2/items/b2', 't2/b2'],
      ['/blocking-only/t2/items/b2', 't2/b2'],
      ['/dynamic-suffix/t2/items/b2', 't2/b2'],
      ['/no-example-fallback/t2/items/b2', 't2/b2'],
      ['/no-example-blocking/t2/items/b2', 't2/b2'],
      ['/no-example-blocking-fallback/t2/items/b2', 't2/b2'],
    ]) {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(text)
    }

    expect((await next.fetch('/not-found-only/t1/items/b1')).status).toBe(200)
    expect((await next.fetch('/not-found-only/t1/items/b2')).status).toBe(404)
    expect((await next.fetch('/not-found-only/t2/items/b2')).status).toBe(404)
  })

  it('preserves inferred fallback and blocking behavior without configuration', async () => {
    const full = await next.fetch('/inferred-full/t2/items/b2')
    expect(full.status).toBe(200)
    expect(await full.text()).toContain('t2/b2')

    const empty = await next.fetch('/inferred-empty/t2/items/b2')
    expect(empty.status).toBe(200)
    expect(await empty.text()).toContain('t2/b2')
  })

  it('fills policy holes using the existing shell heuristic', async () => {
    const blocking = await next.fetch('/inferred-hole-blocking/t2/items/b2')
    expect(blocking.status).toBe(200)
    expect(await blocking.text()).toContain('t2/b2')

    const fallback = await next.fetch('/inferred-hole-fallback/t2/items/b2')
    expect(fallback.status).toBe(200)
    expect(await fallback.text()).toContain('t2/b2')
  })

  it('requires descendants to override every affected explicit policy', async () => {
    const tightened = await next.fetch('/specificity-tighten/en/shoes')
    expect(tightened.status).toBe(200)
    expect(await tightened.text()).toContain('en/shoes')
    expect((await next.fetch('/specificity-tighten/en/hats')).status).toBe(404)
    expect((await next.fetch('/specificity-tighten/fr/shoes')).status).toBe(404)

    const loosened = await next.fetch('/specificity-loosen/fr/hats/details')
    expect(loosened.status).toBe(200)
    expect(await loosened.text()).toContain('fr/hats')
  })

  if (isNextStart) {
    it('emits one route matcher for each effective prefix behavior', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      ) as {
        routes: Record<string, { srcRoute?: string }>
        dynamicRoutes: Record<string, DynamicRoute>
      }
      const sourceRoute = '/[lang]/catalog/[top]/items/[bottom]'
      const matchers = Object.fromEntries(
        Object.entries(manifest.dynamicRoutes).filter(
          ([pathname, route]) =>
            pathname === sourceRoute ||
            route.fallbackSourceRoute === sourceRoute
        )
      )

      expect(matchers[sourceRoute].fallback).toBe(false)
      expect(matchers['/en/catalog/[top]/items/[bottom]'].fallback).toBeNull()
      expect(typeof matchers['/en/catalog/t1/items/[bottom]'].fallback).toBe(
        'string'
      )
      expect(matchers['/es/catalog/[top]/items/[bottom]'].fallback).toBeNull()
      expect(typeof matchers['/es/catalog/t1/items/[bottom]'].fallback).toBe(
        'string'
      )

      expect(manifest.routes['/en/catalog/t1/items/b1']?.srcRoute).toBe(
        sourceRoute
      )
      expect(manifest.routes['/es/catalog/t1/items/b1']?.srcRoute).toBe(
        sourceRoute
      )

      expect(
        manifest.dynamicRoutes['/inferred-hole-blocking/[top]/items/[bottom]']
          .fallback
      ).toBeNull()
      expect(
        typeof manifest.dynamicRoutes[
          '/inferred-hole-blocking/t1/items/[bottom]'
        ].fallback
      ).toBe('string')
      expect(
        typeof manifest.dynamicRoutes[
          '/inferred-hole-fallback/[top]/items/[bottom]'
        ].fallback
      ).toBe('string')
      expect(
        typeof manifest.dynamicRoutes[
          '/inferred-hole-fallback/t1/items/[bottom]'
        ].fallback
      ).toBe('string')

      expect(
        typeof manifest.dynamicRoutes[
          '/no-example-fallback/[top]/items/[bottom]'
        ].fallback
      ).toBe('string')
      expect(
        manifest.dynamicRoutes[
          '/no-example-blocking-fallback/[top]/items/[bottom]'
        ].fallback
      ).toBeNull()
      expect(
        manifest.dynamicRoutes['/no-example-blocking/[top]/items/[bottom]']
          .fallback
      ).toBeNull()
    })

    it('prints the effective matching and deployment-pattern digest', () => {
      expect(next.cliOutput).toContain('Experimental parameter matching')
      expect(next.cliOutput).toContain(
        'not-found  /[lang]/catalog/[top]/items/[bottom]'
      )
      expect(next.cliOutput).toContain(
        'blocking   /en/catalog/[top]/items/[bottom]'
      )
      expect(next.cliOutput).toContain(
        'fallback   /en/catalog/t1/items/[bottom]'
      )
      expect(next.cliOutput).toContain('prerender  /en/catalog/t1/items/b1')
      expect(next.cliOutput).toContain('/inferred-empty/[top]/items/[bottom]')
      expect(next.cliOutput).toContain(
        'blocking   /inferred-hole-blocking/[top]/items/[bottom]'
      )
      expect(next.cliOutput).toContain(
        'fallback   /inferred-hole-blocking/t1/items/[bottom]'
      )
      expect(next.cliOutput).toContain('Emitted dynamic route patterns')
      expect(next.cliOutput).toContain('/[lang]/catalog/[top]/items/[bottom] (')
    })

    it('uses the existing fallback-false adapter routing contract', async () => {
      const { routing } = JSON.parse(
        await next.readFile('build-complete.json')
      ) as {
        routing: { dynamicRoutes: AdapterDynamicRoute[] }
      }
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      ) as {
        preview: { previewModeId: string }
      }
      const sourceRoute = '/[lang]/catalog/[top]/items/[bottom]'
      const blockingRoute = '/en/catalog/[top]/items/[bottom]'
      const fallbackRoute = '/en/catalog/t1/items/[bottom]'
      const routesBySource = new Map(
        routing.dynamicRoutes.map((route) => [route.source, route])
      )

      // Legacy dynamicParams=false and Pages Router fallback:false routes use
      // this preview-only gate so normal misses do not reach the function.
      const fallbackFalseHas = [
        {
          type: 'cookie',
          key: '__prerender_bypass',
          value: prerenderManifest.preview.previewModeId,
        },
        {
          type: 'cookie',
          key: '__next_preview_data',
        },
      ]
      expect(routesBySource.get(sourceRoute)?.has).toEqual(fallbackFalseHas)
      expect(routesBySource.get(`${sourceRoute}.rsc`)?.has).toEqual(
        fallbackFalseHas
      )
      expect(routesBySource.get(blockingRoute)?.has).toBeUndefined()
      expect(routesBySource.get(`${blockingRoute}.rsc`)?.has).toBeUndefined()
      expect(routesBySource.get(fallbackRoute)?.has).toBeUndefined()
      expect(routesBySource.get(`${fallbackRoute}.rsc`)?.has).toBeUndefined()

      const routeSources = routing.dynamicRoutes.map((route) => route.source)
      expect(routeSources.indexOf(fallbackRoute)).toBeLessThan(
        routeSources.indexOf(blockingRoute)
      )
      expect(routeSources.indexOf(blockingRoute)).toBeLessThan(
        routeSources.indexOf(sourceRoute)
      )
    })
  }
})

describe('experimental parameter matching complex route shapes', () => {
  const { next, isNextStart } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'complex-routes'),
  })

  it('applies root and catch-all parameter policies in order', async () => {
    for (const pathname of [
      '/en/catch-all/known/deep',
      '/en/catch-all/novel/deep',
    ]) {
      const response = await next.fetch(pathname)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        `en/${pathname.split('/').slice(3).join('/')}`
      )
    }

    expect((await next.fetch('/fr/catch-all/novel/deep')).status).toBe(404)
  })

  it('closes both forms of an optional catch-all miss', async () => {
    for (const pathname of [
      '/en/optional-catch-all',
      '/en/optional-catch-all/known/deep',
    ]) {
      expect((await next.fetch(pathname)).status).toBe(200)
    }

    expect((await next.fetch('/en/optional-catch-all/novel')).status).toBe(404)
    expect((await next.fetch('/fr/optional-catch-all')).status).toBe(404)
  })

  it('merges an agreed policy for a param shared by parallel slots', async () => {
    for (const item of ['known', 'novel']) {
      const response = await next.fetch(`/en/parallel/${item}`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain(`children:en/${item}`)
      expect(html).toContain(`left:en/${item}`)
      expect(html).toContain(`right:en/${item}`)
    }

    expect((await next.fetch('/fr/parallel/novel')).status).toBe(404)
  })

  if (isNextStart) {
    it('does not print parameter matching diagnostics by default', () => {
      expect(next.cliOutput).not.toContain('Experimental parameter matching')
      expect(next.cliOutput).not.toContain('Emitted dynamic route patterns')
    })

    it('emits root-gated matchers for catch-all and parallel routes', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      ) as {
        dynamicRoutes: Record<string, DynamicRoute>
      }

      expect(
        manifest.dynamicRoutes['/[lang]/catch-all/[...parts]'].fallback
      ).toBe(false)
      expect(
        typeof manifest.dynamicRoutes['/en/catch-all/[...parts]'].fallback
      ).toBe('string')
      expect(manifest.dynamicRoutes['/[lang]/parallel/[item]'].fallback).toBe(
        false
      )
      expect(
        typeof manifest.dynamicRoutes['/en/parallel/[item]'].fallback
      ).toBe('string')
    })
  }
})

describe('experimental parameter matching foreground policy', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'foreground-policy'),
  })

  if (skipped || isNextDev) {
    it.skip('only runs against a production route cache', () => {})
    return
  }

  function readShellMarker(body: string): string {
    const match = body.match(/data-shell-marker="[^"]+">([^<]+)</)
    expect(match).not.toBeNull()
    return match![1]
  }

  async function render(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain(`<p id="params">${pathname.split('/').at(-1)}</p>`)
    return { body, marker: readShellMarker(body) }
  }

  it('generates a distinct shell before returning a blocking miss', async () => {
    const first = await render('/blocking/novel-a')
    const other = await render('/blocking/novel-b')

    expect(other.marker).not.toBe(first.marker)
    expect(first.body).not.toContain('<p id="shell">waiting for params</p>')
    expect(other.body).not.toContain('<p id="shell">waiting for params</p>')

    const repeat = await render('/blocking/novel-a')
    expect(repeat.marker).toBe(first.marker)
  })

  it('returns the shared build shell for a fallback miss', async () => {
    const first = await render('/fallback/novel-a')
    const other = await render('/fallback/novel-b')

    expect(other.marker).toBe(first.marker)
    expect(first.body).toContain('<p id="shell">waiting for params</p>')
    expect(other.body).toContain('<p id="shell">waiting for params</p>')
  })
})

describe('experimental parameter matching ordering validation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'invalid-order'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skipped', () => {})
    return
  }

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en/t1/b1')
    } else {
      await next.build().catch(() => {})
    }
  })

  it('rejects incoherent policies after layout and page merging', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'Expected parameters to follow not-found, blocking, fallback, then dynamic order'
      )
    })
  })
})

describe('experimental parameter matching dynamic validation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'dynamic-prerender'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skipped', () => {})
    return
  }

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/t1/b1')
    } else {
      await next.build().catch(() => {})
    }
  })

  it('rejects generateStaticParams output at or below a dynamic param', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'cannot prerender parameter "top" because parameter "top" is configured as "dynamic"'
      )
    })
  })
})

describe('experimental parameter matching type validation', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'type-invalid-param-below'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped || !isNextStart) {
    it.skip('only runs during production builds', () => {})
    return
  }

  beforeAll(async () => {
    await next.build().catch(() => {})
  })

  it('constrains matching keys to params visible to the exporting module', () => {
    expect(next.cliOutput).toContain('Failed to type check.')
    expect(next.cliOutput).toMatch(
      /Type '"category"' does not satisfy the constraint 'never'/
    )
  })
})

describe('experimental parameter matching feature flag', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'flag-disabled'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skipped', () => {})
    return
  }

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en')
    } else {
      await next.build().catch(() => {})
    }
  })

  it('requires the experimental config flag', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'experimental `paramMatching` flag is not enabled'
      )
    })
  })
})

describe('experimental parameter matching cache components requirement', () => {
  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it.skip('not applicable when Cache Components is forced on', () => {})
    return
  }

  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'cache-components-disabled'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skipped', () => {})
    return
  }

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/en')
    } else {
      await next.build().catch(() => {})
    }
  })

  it('requires Cache Components', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'cannot use experimental parameter matching without enabling `cacheComponents`'
      )
    })
  })
})

describe('experimental parameter matching static export validation', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'export-open-param'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped || !isNextStart) {
    it.skip('only runs during production builds', () => {})
    return
  }

  beforeAll(async () => {
    await next.build().catch(() => {})
  })

  it('requires every exported param to be explicitly closed for now', () => {
    expect(next.cliOutput).toContain(
      'must configure parameter "lang" as "not-found"'
    )
  })
})

describe('experimental parameter matching fallback validation', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'empty-fallback'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped || !isNextStart) {
    it.skip('only runs during production builds', () => {})
    return
  }

  beforeAll(async () => {
    await next.build().catch(() => {})
  })

  it('does not downgrade an explicitly configured fallback to blocking', () => {
    expect(next.cliOutput).toContain(
      'Error occurred prerendering page "/t1/[bottom]"'
    )
  })
})

describe('experimental parameter matching generic shell validation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'missing-fallback-seed'),
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it.skip('skipped', () => {})
    return
  }

  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/t1/b1')
    } else {
      await next.build().catch(() => {})
    }
  })

  it('validates the generic blocking shell when no example reaches fallback', async () => {
    await retry(() => {
      if (isNextDev) {
        expect(next.cliOutput).toContain(
          'encountered runtime data during prerendering'
        )
        expect(next.cliOutput).toContain('at TopLayout')
      } else {
        expect(next.cliOutput).toContain(
          'Error occurred prerendering page "/[top]/[bottom]"'
        )
      }
    })
  })
})

describe('experimental parameter matching development shell validation', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'dev-shell-validation'),
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })

  if (skipped || !isNextDev) {
    it.skip('only runs in development', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  async function renderAndWaitForValidation(pathname: string) {
    const outputIndex = next.cliOutput.length
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)

    return getDevCliValidationOutput(`http://n${pathname}`, () =>
      next.cliOutput.slice(outputIndex)
    )
  }

  it('uses the most-specific generated shape for an inferred generated value', async () => {
    const inferredKnown = await renderAndWaitForValidation('/inferred/t1/b2')
    expect(inferredKnown).not.toContain(
      'Error: Route "/inferred/[top]/[bottom]"'
    )
  })

  it('uses the most-specific generated shape for an inferred novel param', async () => {
    const inferredNovel = await renderAndWaitForValidation('/inferred/t2/b2')
    expect(inferredNovel).not.toContain(
      'Error: Route "/inferred/[top]/[bottom]"'
    )
  })

  it('uses the most-specific generated shape when no fallback is configured', async () => {
    const blockingOnlyNovel = await renderAndWaitForValidation(
      '/blocking-only/t2/b2'
    )
    expect(blockingOnlyNovel).not.toContain(
      'Error: Route "/blocking-only/[top]/[bottom]"'
    )
  })

  it('treats an explicitly blocking param as known', async () => {
    const blockingNovel = await renderAndWaitForValidation('/blocking/t2/b2')
    expect(blockingNovel).not.toContain(
      'Error: Route "/blocking/[top]/[bottom]"'
    )
  })

  it('treats an explicitly fallback param as unknown', async () => {
    const fallbackKnown = await renderAndWaitForValidation('/fallback/t1/b2')
    expect(fallbackKnown).toContain('Error: Route "/fallback/[top]/[bottom]"')
  })
})
