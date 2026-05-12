import { nextTestSetup, isNextStart } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

interface CategoryStats {
  count: number
  bytes: number
}

interface CategoryStatsWithShared extends CategoryStats {
  sharedAvg: CategoryStats | null
}

interface RouteInfo {
  route: string
  type: string
  serverBundled: CategoryStatsWithShared
  serverMaps: CategoryStatsWithShared
  serverUnbundled: CategoryStatsWithShared
  clientJs: CategoryStatsWithShared
  clientMaps: CategoryStatsWithShared
  clientCss: CategoryStatsWithShared
}

interface Totals {
  serverBundled: CategoryStats
  serverMaps: CategoryStats
  serverUnbundled: CategoryStats
  clientJs: CategoryStats
  clientMaps: CategoryStats
  clientCss: CategoryStats
}

interface ToolOutput {
  routes: RouteInfo[]
  totals: Totals
}

const ALL_CATEGORIES = [
  'serverBundled',
  'serverMaps',
  'serverUnbundled',
  'clientJs',
  'clientMaps',
  'clientCss',
] as const

describe('next internal static-routes-info', () => {
  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  beforeAll(async () => {
    const buildResult = await next.build()
    if (buildResult.exitCode !== 0) {
      throw new Error(
        `next build failed with exit code ${buildResult.exitCode}`
      )
    }
  })

  async function runTool(
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const result = await runNextCommand(
      ['internal', 'static-routes-info', next.testDir, ...args],
      {
        // Run from the next.js package dir (default) so internal modules
        // resolve correctly regardless of the test app's setup.
        stdout: true,
        stderr: true,
      }
    )
    if (result.code !== 0) {
      console.log('static-routes-info stdout:', result.stdout)
      console.log('static-routes-info stderr:', result.stderr)
    }
    return result
  }

  function getRoute(output: ToolOutput, route: string): RouteInfo {
    const found = output.routes.find((r) => r.route === route)
    if (!found) {
      throw new Error(
        `Route ${route} not found. Got: ${output.routes
          .map((r) => `${r.route} (${r.type})`)
          .join(', ')}`
      )
    }
    return found
  }

  it('--help should print usage', async () => {
    const result = await runNextCommand(
      ['internal', 'static-routes-info', '--help'],
      { stdout: true, stderr: true }
    )
    expect(result.code).toBe(0)
    const out = result.stdout + result.stderr
    expect(out).toContain('static-routes-info')
    expect(out).toContain('--json')
    expect(out).toContain('--limit')
  })

  it('--json should report all expected route types', async () => {
    const result = await runTool(['--json'])
    expect(result.code).toBe(0)

    const output = JSON.parse(result.stdout) as ToolOutput

    // Every route type from the fixture is represented at least once.
    const types = new Set(output.routes.map((r) => r.type))
    expect(types).toContain('app-page') // app/page.tsx + app/about/page.tsx
    expect(types).toContain('app-route') // app/api/node/route.ts + app/api/edge/route.ts
    expect(types).toContain('pages') // pages/pages-ssr.tsx + pages/pages-ssr-2.tsx
    expect(types).toContain('pages-static') // pages/pages-static.tsx
    expect(types).toContain('pages-api') // pages/api/hello.ts
    expect(types).toContain('middleware') // middleware.ts
    // edge-function is no longer a route type — edge route handlers are
    // reported under their actual type (e.g. app-route for App Router).
    expect(types).not.toContain('edge-function')

    // Specific URLs should be present.
    const routes = output.routes.map((r) => r.route)
    expect(routes).toEqual(
      expect.arrayContaining([
        '/',
        '/about',
        '/api/node',
        '/api/edge',
        '/pages-ssr',
        '/pages-ssr-2',
        '/pages-static',
        '/api/hello',
      ])
    )

    // /api/edge is an App Router route handler with `runtime: 'edge'` and
    // is now reported as `app-route` (peer of /api/node).
    expect(getRoute(output, '/api/edge').type).toBe('app-route')

    // Each category on each route is well-formed.
    for (const r of output.routes) {
      for (const cat of ALL_CATEGORIES) {
        expect(typeof r[cat].count).toBe('number')
        expect(typeof r[cat].bytes).toBe('number')
        // count/bytes consistency: 0 files ↔ 0 bytes; >0 files → >0 bytes.
        if (r[cat].count === 0) {
          expect(r[cat].bytes).toBe(0)
        } else {
          expect(r[cat].bytes).toBeGreaterThan(0)
        }
        // sharedAvg is either null (no peers) or shaped like CategoryStats.
        if (r[cat].sharedAvg !== null) {
          expect(typeof r[cat].sharedAvg!.count).toBe('number')
          expect(typeof r[cat].sharedAvg!.bytes).toBe('number')
        }
      }
    }
  })

  it('--json should expose the right files per route type', async () => {
    const result = await runTool(['--json'])
    const output = JSON.parse(result.stdout) as ToolOutput

    // app-page: has server JS and client JS. The fixture imports a
    // `'use client'` component so the route's `_client-reference-manifest.js`
    // includes per-route client chunks for both bundlers (Turbopack
    // populates `entryJSFiles`, webpack populates `clientModules.chunks`).
    // This exercises the manifest parser against both bundler outputs and
    // catches regressions like the old `'] = '` marker that only matched
    // Turbopack's spaced assignment, missing webpack's `']='` form.
    const appPage = getRoute(output, '/')
    expect(appPage.type).toBe('app-page')
    expect(appPage.serverBundled.count).toBeGreaterThan(0)
    expect(appPage.clientJs.count).toBeGreaterThan(0)
    if (isTurbopack) {
      // Turbopack also populates entryCSSFiles for the global stylesheet
      // imported by `app/page.tsx`. Webpack's stylesheet handling currently
      // doesn't surface in `entryCSSFiles` for this fixture.
      expect(appPage.clientCss.count).toBeGreaterThan(0)
    }

    // app-route (Node runtime): has server JS, no client JS / CSS.
    const appRoute = getRoute(output, '/api/node')
    expect(appRoute.type).toBe('app-route')
    expect(appRoute.serverBundled.count).toBeGreaterThan(0)
    expect(appRoute.clientJs.count).toBe(0)
    expect(appRoute.clientCss.count).toBe(0)

    // app-route (Edge runtime): has server JS, no client JS, no nft.json
    // (so unbundled is always 0 — the bundle includes everything inline).
    const edgeAppRoute = getRoute(output, '/api/edge')
    expect(edgeAppRoute.type).toBe('app-route')
    expect(edgeAppRoute.serverBundled.count).toBeGreaterThan(0)
    expect(edgeAppRoute.serverUnbundled.count).toBe(0)
    expect(edgeAppRoute.clientJs.count).toBe(0)

    // middleware: has server JS, no client JS, no unbundled.
    const middleware = output.routes.find((r) => r.type === 'middleware')!
    expect(middleware).toBeDefined()
    expect(middleware.serverBundled.count).toBeGreaterThan(0)
    expect(middleware.serverUnbundled.count).toBe(0)
    expect(middleware.clientJs.count).toBe(0)

    // pages (SSR): has server JS, has client JS.
    const pagesSsr = getRoute(output, '/pages-ssr')
    expect(pagesSsr.type).toBe('pages')
    expect(pagesSsr.serverBundled.count).toBeGreaterThan(0)
    expect(pagesSsr.clientJs.count).toBeGreaterThan(0)

    // pages-static: no server JS, only client JS.
    const pagesStatic = getRoute(output, '/pages-static')
    expect(pagesStatic.type).toBe('pages-static')
    expect(pagesStatic.serverBundled.count).toBe(0)
    expect(pagesStatic.serverUnbundled.count).toBe(0)
    expect(pagesStatic.clientJs.count).toBeGreaterThan(0)

    // pages-api: has server JS, no client JS.
    const pagesApi = getRoute(output, '/api/hello')
    expect(pagesApi.type).toBe('pages-api')
    expect(pagesApi.serverBundled.count).toBeGreaterThan(0)
    expect(pagesApi.clientJs.count).toBe(0)
  })

  it('--json totals should be sums of unique files (not per-route sums)', async () => {
    const result = await runTool(['--json'])
    const output = JSON.parse(result.stdout) as ToolOutput

    // Per-category sum across routes (counts duplicates)
    const perRouteSum = (cat: keyof ToolOutput['totals']) =>
      output.routes.reduce((acc, r) => acc + r[cat].bytes, 0)

    // Totals are deduplicated, so each total <= sum of per-route values.
    // For this fixture there are shared server chunks (Next.js runtime
    // included via nft.json on every route) and shared client chunks
    // (framework, polyfills, _app), so totals must be strictly smaller
    // than the sum across routes.
    for (const cat of [
      'serverBundled',
      'serverMaps',
      'serverUnbundled',
      'clientJs',
    ] as const) {
      expect(output.totals[cat].bytes).toBeLessThanOrEqual(perRouteSum(cat))
    }
    expect(output.totals.serverBundled.bytes).toBeLessThan(
      perRouteSum('serverBundled')
    )
    expect(output.totals.clientJs.bytes).toBeLessThan(perRouteSum('clientJs'))
  })

  it('--json routes should be sorted by total size descending', async () => {
    const result = await runTool(['--json'])
    const output = JSON.parse(result.stdout) as ToolOutput

    const totalBytes = (r: RouteInfo) =>
      r.serverBundled.bytes +
      r.serverMaps.bytes +
      r.serverUnbundled.bytes +
      r.clientJs.bytes +
      r.clientMaps.bytes +
      r.clientCss.bytes

    for (let i = 1; i < output.routes.length; i++) {
      expect(totalBytes(output.routes[i - 1])).toBeGreaterThanOrEqual(
        totalBytes(output.routes[i])
      )
    }
  })

  it('--limit should keep only the top N routes; totals reflect all routes', async () => {
    const full = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput
    const limited = JSON.parse(
      (await runTool(['--json', '--limit', '2'])).stdout
    ) as ToolOutput

    expect(limited.routes).toHaveLength(2)
    expect(limited.routes[0].route).toBe(full.routes[0].route)
    expect(limited.routes[1].route).toBe(full.routes[1].route)

    // Totals are independent of --limit.
    expect(limited.totals).toEqual(full.totals)
  })

  it('markdown (default) output should be a valid table containing all routes', async () => {
    const result = await runTool([])
    expect(result.code).toBe(0)
    const out = result.stdout

    // Section headers
    expect(out).toContain('## Routes')
    expect(out).toContain('## Totals')

    // Column headers
    for (const header of [
      'Route',
      'Type',
      'Client JS',
      'Client CSS',
      'Client Source Maps',
      'Server Bundled JS',
      'Server Unbundled',
      'Server Source Maps',
    ]) {
      expect(out).toContain(header)
    }

    // Each route appears in the markdown.
    for (const route of [
      '/api/node',
      '/api/edge',
      '/pages-ssr',
      '/pages-static',
      '/api/hello',
    ]) {
      expect(out).toContain(route)
    }

    // The "**Total**" row in the totals table.
    expect(out).toContain('**Total**')

    // Rows look like markdown table rows.
    expect(out).toMatch(/\|\s+Route\s+\|/)
    expect(out).toMatch(/\|\s+-+\s+\|/)
  })

  it('--json sharedAvg should be null for routes with no peers', async () => {
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput

    // The fixture has exactly one route of each of these types.
    for (const route of [
      '/pages-static', // only pages-static
      '/api/hello', // only pages-api
    ]) {
      const r = getRoute(output, route)
      for (const cat of ALL_CATEGORIES) {
        expect(r[cat].sharedAvg).toBeNull()
      }
    }
    // Middleware is also a singleton.
    const mw = output.routes.find((r) => r.type === 'middleware')!
    expect(mw).toBeDefined()
    for (const cat of ALL_CATEGORIES) {
      expect(mw[cat].sharedAvg).toBeNull()
    }
  })

  it('--json sharedAvg should be present for routes with peers, and never exceed the route itself', async () => {
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput

    // Routes with at least one peer of the same type:
    //   - app-page: `/`, `/about`, `/_not-found`
    //   - app-route: `/api/node`, `/api/edge`
    //   - pages: `/pages-ssr`, `/pages-ssr-2`
    const withPeers = output.routes.filter(
      (r) =>
        r.type === 'app-page' || r.type === 'app-route' || r.type === 'pages'
    )
    expect(withPeers.length).toBeGreaterThanOrEqual(7)
    for (const r of withPeers) {
      for (const cat of ALL_CATEGORIES) {
        expect(r[cat].sharedAvg).not.toBeNull()
        expect(r[cat].sharedAvg!.count).toBeLessThanOrEqual(r[cat].count)
        expect(r[cat].sharedAvg!.bytes).toBeLessThanOrEqual(r[cat].bytes)
      }
    }
  })

  it('--json sharedAvg should observe deliberate chunk sharing across peer routes', async () => {
    // Both `/pages-ssr` and `/pages-ssr-2` import `lib/shared.ts` and use
    // the standard Pages Router shared chunks (`_app`, framework, main,
    // polyfills). They MUST report meaningful sharing. Likewise `/` and
    // `/about` both import `lib/shared.ts` and share the App Router
    // root layout + framework chunks.
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput

    // Pages Router peers — Pages Router's chunking is deterministic across
    // both bundlers (build-manifest lists pages chunks explicitly).
    const ssr1 = getRoute(output, '/pages-ssr')
    const ssr2 = getRoute(output, '/pages-ssr-2')
    expect(ssr1.type).toBe('pages')
    expect(ssr2.type).toBe('pages')

    // At least 3 of the 6 client JS chunks should be shared between the
    // two pages (framework, main, polyfills, _app — minus per-page entry).
    expect(ssr1.clientJs.sharedAvg!.count).toBeGreaterThanOrEqual(3)
    expect(ssr1.clientJs.sharedAvg!.bytes).toBeGreaterThan(0)
    // Most of the route's client JS comes from shared infra; expect the
    // shared portion to be a substantial fraction of the total.
    expect(ssr1.clientJs.sharedAvg!.bytes).toBeGreaterThan(
      ssr1.clientJs.bytes * 0.5
    )
    // Both peers must report the same shared average (commutative).
    expect(ssr2.clientJs.sharedAvg).toEqual(ssr1.clientJs.sharedAvg)

    // Similarly, server-bundled JS for the two pages should mostly overlap
    // (Next.js runtime chunks dominate the bundle).
    expect(ssr1.serverBundled.sharedAvg!.count).toBeGreaterThanOrEqual(3)
    expect(ssr1.serverBundled.sharedAvg!.bytes).toBeGreaterThan(
      ssr1.serverBundled.bytes * 0.5
    )

    // App Router peers — both `/` and `/about` import the same shared lib
    // and the same root layout, so a substantial share is expected.
    const root = getRoute(output, '/')
    const about = getRoute(output, '/about')
    expect(root.serverBundled.sharedAvg!.bytes).toBeGreaterThan(
      root.serverBundled.bytes * 0.5
    )
    expect(about.serverBundled.sharedAvg!.bytes).toBeGreaterThan(
      about.serverBundled.bytes * 0.5
    )
  })

  it('--json sharedAvg should match a hand-computed average for app-pages', async () => {
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput

    // Reproduce the tool's algorithm in the test: for each route, average
    // the intersection size across same-type peers. We can't recompute file
    // intersections here (we don't have the file lists in the JSON), but we
    // can verify a known invariant: when ALL app-pages have the same set of
    // server-unbundled files (which is the case in our small fixture, since
    // they all trace identical Node deps), the sharedAvg.count for that
    // category equals the route's own count. Likewise for serverUnbundled
    // bytes.
    const appPages = output.routes.filter((r) => r.type === 'app-page')
    expect(appPages.length).toBeGreaterThan(1)
    const serverUnbundledCounts = appPages.map((r) => r.serverUnbundled.count)
    const allEqual = serverUnbundledCounts.every(
      (c) => c === serverUnbundledCounts[0]
    )
    if (allEqual) {
      for (const r of appPages) {
        expect(r.serverUnbundled.sharedAvg!.count).toBe(r.serverUnbundled.count)
        expect(r.serverUnbundled.sharedAvg!.bytes).toBe(r.serverUnbundled.bytes)
      }
    }
  })

  it('totals should not include sharedAvg', async () => {
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput
    for (const cat of ALL_CATEGORIES) {
      expect(output.totals[cat]).toEqual({
        count: expect.any(Number),
        bytes: expect.any(Number),
      })
      expect(
        (output.totals[cat] as unknown as Record<string, unknown>).sharedAvg
      ).toBeUndefined()
    }
  })

  it('markdown should include a Shared section', async () => {
    const md = (await runTool([])).stdout
    expect(md).toContain('## Shared')
    // Routes with no peers should appear as `n/a`.
    expect(md).toContain('n/a')
  })

  it('markdown numbers should agree with --json numbers for shared routes', async () => {
    const md = (await runTool([])).stdout
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput

    // Pick a route that should always have non-zero server JS and confirm
    // its `<n> files` count appears in the markdown output. This is a
    // sanity check that markdown rendering uses the same data as JSON.
    const ssr = getRoute(output, '/pages-ssr')
    expect(md).toContain(`${ssr.serverBundled.count} files`)
  })
})
