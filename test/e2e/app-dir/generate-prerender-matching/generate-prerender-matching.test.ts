import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type DynamicRoute = {
  fallback: false | null | string
  fallbackSourceRoute?: string
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
