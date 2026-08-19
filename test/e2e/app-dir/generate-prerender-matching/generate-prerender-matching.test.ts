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

describe('unstable prerender matching', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('merges a layout matcher into one page and lets another page override it', async () => {
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

  it('preserves inferred fallback and blocking behavior without a matcher', async () => {
    const full = await next.fetch('/inferred-full/t2/items/b2')
    expect(full.status).toBe(200)
    expect(await full.text()).toContain('t2/b2')

    const empty = await next.fetch('/inferred-empty/t2/items/b2')
    expect(empty.status).toBe(200)
    expect(await empty.text()).toContain('t2/b2')
  })

  if (isNextStart) {
    it('emits one matcher entry for each effective prefix behavior', async () => {
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
    })

    it('prints the effective matcher and deployment-pattern digest', () => {
      expect(next.cliOutput).toContain('Experimental prerender matchers')
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

describe('unstable prerender matcher ordering validation', () => {
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

  it('rejects a stricter mode after a more open phase', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'Expected parameters to follow not-found, blocking, fallback, then dynamic order'
      )
    })
  })
})

describe('unstable prerender matcher dynamic validation', () => {
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

describe('unstable prerender matcher type validation', () => {
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

  it('constrains matcher keys to params visible to the exporting module', () => {
    expect(next.cliOutput).toContain('Failed to type check.')
    expect(next.cliOutput).toMatch(
      /Type '"category"' does not satisfy the constraint 'never'/
    )
  })
})

describe('unstable prerender matcher feature flag', () => {
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
        'experimental `prerenderMatching` flag is not enabled'
      )
    })
  })
})

describe('unstable prerender matcher cache components requirement', () => {
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
        'cannot use an unstable prerender matcher without enabling `cacheComponents`'
      )
    })
  })
})

describe('unstable prerender matcher static export validation', () => {
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

describe('unstable prerender matcher fallback validation', () => {
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

describe('unstable prerender matcher fallback boundary validation', () => {
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

  it('requires a generated prefix before an explicit fallback', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain(
        'generateStaticParams did not produce a parameter combination that reaches that fallback boundary'
      )
      expect(next.cliOutput).toContain(
        'export `const instant = false` to opt out of static shell validation'
      )
    })
  })
})

describe('unstable prerender matcher development shell validation', () => {
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
