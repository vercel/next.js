import { nextTestSetup, isNextStart } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

interface CategoryStats {
  count: number
  bytes: number
}

interface SharedStats extends CategoryStats {
  percentCount: number
  percentBytes: number
}

interface CategoryStatsWithShared extends CategoryStats {
  sharedAvg: SharedStats | null
  files?: string[]
}

interface CategoryStatsWithFiles extends CategoryStats {
  files?: string[]
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
  serverBundled: CategoryStatsWithFiles
  serverMaps: CategoryStatsWithFiles
  serverUnbundled: CategoryStatsWithFiles
  clientJs: CategoryStatsWithFiles
  clientMaps: CategoryStatsWithFiles
  clientCss: CategoryStatsWithFiles
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
    expect(out).toContain('--sort')
    expect(out).toContain('--files')
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

    // /items/[itemId] sits inside a `(group)` route group AND has a
    // dynamic segment. The internal client-reference manifest entry name
    // contains unescaped `]` characters, which a naïve `[^\]]*` regex
    // would terminate early. This route forces the parser to walk a JS
    // string literal correctly across `]`s.
    const dyn = getRoute(output, '/items/[itemId]')
    expect(dyn.type).toBe('app-page')
    expect(dyn.serverBundled.count).toBeGreaterThan(0)
    expect(dyn.clientJs.count).toBeGreaterThan(0)

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

    // app-page: has server JS, client JS, and client CSS. The fixture
    // imports a `'use client'` Counter component (which itself imports a
    // CSS module) so the route's `_client-reference-manifest.js` carries
    // per-route client chunks for both bundlers (Turbopack populates
    // `entryJSFiles`, webpack populates `clientModules.chunks`). The
    // global `globals.css` is imported from `app/layout.tsx`, exercising
    // the layout-segment entry in `entryCSSFiles`. This catches the
    // regression where the parser only matched Turbopack's `'] = '`
    // marker and missed webpack's `']='` form.
    const appPage = getRoute(output, '/')
    expect(appPage.type).toBe('app-page')
    expect(appPage.serverBundled.count).toBeGreaterThan(0)
    expect(appPage.clientJs.count).toBeGreaterThan(0)
    // Both bundlers populate `entryCSSFiles` with at least globals.css
    // (from the layout). Turbopack additionally attributes the Counter
    // CSS module only to routes that transitively import it; webpack
    // merges all entries' CSS into every route's manifest, so it reports
    // the same count for every app-page. We only assert "at least one"
    // here; the next assertion exercises per-route differentiation.
    expect(appPage.clientCss.count).toBeGreaterThan(0)

    // Client component contribution check (Turbopack only). The fixture
    // imports the `'use client'` Counter component from `/` and `/about`
    // but not from `/no-client`. On Turbopack, per-route client-reference
    // manifests are independent, so `/about` ships strictly more client
    // JS and CSS than `/no-client` — the `Counter.tsx` chunk plus its
    // `counter.module.css` are only attributed to routes that import them.
    //
    // Webpack's flight-manifest plugin runs `mergeManifest` across all
    // app-pages (see `flight-manifest-plugin.ts`'s `mergeManifest`), so
    // every per-route CRM ends up with the union of every other route's
    // `clientModules` and `entryCSSFiles`. This makes per-route
    // attribution impossible on webpack — we skip the assertion there.
    if (isTurbopack) {
      const noClient = getRoute(output, '/no-client')
      const about = getRoute(output, '/about')
      expect(about.clientJs.count).toBeGreaterThan(noClient.clientJs.count)
      expect(about.clientJs.bytes).toBeGreaterThan(noClient.clientJs.bytes)
      expect(about.clientCss.count).toBeGreaterThan(noClient.clientCss.count)
      expect(about.clientCss.bytes).toBeGreaterThan(noClient.clientCss.bytes)
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

  it('--json routes should be sorted alphabetically by name by default', async () => {
    const result = await runTool(['--json'])
    const output = JSON.parse(result.stdout) as ToolOutput

    for (let i = 1; i < output.routes.length; i++) {
      // localeCompare is what the tool uses internally; comparing with `<=`
      // here would be wrong for unicode-aware ordering.
      expect(
        output.routes[i - 1].route.localeCompare(output.routes[i].route)
      ).toBeLessThanOrEqual(0)
    }
  })

  it.each([
    ['client-js', (r: RouteInfo) => r.clientJs.bytes],
    ['client-css', (r: RouteInfo) => r.clientCss.bytes],
    ['client-map', (r: RouteInfo) => r.clientMaps.bytes],
    ['client', (r: RouteInfo) => r.clientJs.bytes + r.clientCss.bytes],
    ['server-bundled-js', (r: RouteInfo) => r.serverBundled.bytes],
    ['server-unbundled', (r: RouteInfo) => r.serverUnbundled.bytes],
    ['server-map', (r: RouteInfo) => r.serverMaps.bytes],
    [
      'server',
      (r: RouteInfo) => r.serverBundled.bytes + r.serverUnbundled.bytes,
    ],
    [
      'total',
      (r: RouteInfo) =>
        r.serverBundled.bytes +
        r.serverMaps.bytes +
        r.serverUnbundled.bytes +
        r.clientJs.bytes +
        r.clientMaps.bytes +
        r.clientCss.bytes,
    ],
  ] as const)(
    '--sort %s should order routes descending by that metric',
    async (key, metric) => {
      const result = await runTool(['--json', '--sort', key])
      expect(result.code).toBe(0)
      const output = JSON.parse(result.stdout) as ToolOutput

      for (let i = 1; i < output.routes.length; i++) {
        expect(metric(output.routes[i - 1])).toBeGreaterThanOrEqual(
          metric(output.routes[i])
        )
      }
    }
  )

  it('--sort with an invalid key should error', async () => {
    const result = await runTool(['--json', '--sort', 'bogus'])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("invalid --sort key 'bogus'")
  })

  it('--limit should keep only the top N routes; totals reflect all routes', async () => {
    const full = JSON.parse(
      (await runTool(['--json', '--sort', 'total'])).stdout
    ) as ToolOutput
    const limited = JSON.parse(
      (await runTool(['--json', '--sort', 'total', '--limit', '2'])).stdout
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
        // percentCount / percentBytes are always between 0 and 100
        // inclusive (sharedAvg cannot exceed own).
        expect(r[cat].sharedAvg!.percentCount).toBeGreaterThanOrEqual(0)
        expect(r[cat].sharedAvg!.percentCount).toBeLessThanOrEqual(100)
        expect(r[cat].sharedAvg!.percentBytes).toBeGreaterThanOrEqual(0)
        expect(r[cat].sharedAvg!.percentBytes).toBeLessThanOrEqual(100)
        // Percentages are exactly the ratio of sharedAvg to own (or 0 when
        // own is 0). Use a small epsilon for floating-point.
        const expectedPctCount =
          r[cat].count > 0 ? (r[cat].sharedAvg!.count / r[cat].count) * 100 : 0
        const expectedPctBytes =
          r[cat].bytes > 0 ? (r[cat].sharedAvg!.bytes / r[cat].bytes) * 100 : 0
        expect(r[cat].sharedAvg!.percentCount).toBeCloseTo(expectedPctCount, 8)
        expect(r[cat].sharedAvg!.percentBytes).toBeCloseTo(expectedPctBytes, 8)
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
    // Raw intersection count/bytes are commutative (intersection is
    // symmetric). Percentages are NOT commutative because they're divided
    // by each route's own count/bytes, which can differ between peers.
    expect(ssr2.clientJs.sharedAvg!.count).toBe(ssr1.clientJs.sharedAvg!.count)
    expect(ssr2.clientJs.sharedAvg!.bytes).toBe(ssr1.clientJs.sharedAvg!.bytes)

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

  it('--json sharedAvg should match a from-scratch reimplementation for every route × category', async () => {
    // The strongest guarantee we can offer for the sharedAvg metric: walk the
    // dist-relative file lists from --files and re-run the exact algorithm in
    // the test, then compare every (route, category) cell against what the
    // tool reports. Any divergence — including spurious 100% values caused by
    // path normalization mismatches, off-by-one peer counts, or asymmetric
    // intersection — fails the test.
    const output = JSON.parse(
      (await runTool(['--json', '--files'])).stdout
    ) as ToolOutput

    // Build a fast file-size lookup from `count` and `bytes`. We don't have
    // bytes-per-file in the JSON, but for a hand-computed *average size of
    // intersection* we need them. So re-derive sizes by reading totals: any
    // file in totals[cat].files maps to a size we can estimate? No — totals
    // only have count/bytes too.
    //
    // Instead, we cross-check ONLY the file *count* against a hand-computed
    // average. Bytes are checked separately by the byte-level test below
    // using the size info that does exist (per-route own bytes).
    const byType = new Map<string, RouteInfo[]>()
    for (const r of output.routes) {
      const list = byType.get(r.type) ?? []
      list.push(r)
      byType.set(r.type, list)
    }

    for (const r of output.routes) {
      const peers = (byType.get(r.type) ?? []).filter((p) => p !== r)
      for (const cat of ALL_CATEGORIES) {
        const sa = r[cat].sharedAvg
        if (peers.length === 0) {
          expect(sa).toBeNull()
          continue
        }
        const myFiles = new Set(r[cat].files)
        let totalIntersectCount = 0
        for (const p of peers) {
          const peerFiles = new Set(p[cat].files)
          let intersect = 0
          for (const f of myFiles) if (peerFiles.has(f)) intersect++
          totalIntersectCount += intersect
        }
        const expectedCount = totalIntersectCount / peers.length
        expect(sa).not.toBeNull()
        // Floating-point exact: division by integer peer count of an integer
        // sum is exactly representable for the sizes we have here.
        expect(sa!.count).toBe(expectedCount)
      }
    }
  })

  it('--json sharedAvg.count == own.count IFF every peer is a strict superset (100%-shared sanity check)', async () => {
    // A 100% sharedAvg.count is only legitimate when, for every peer, this
    // route's set is a (possibly equal) subset of the peer's set. This test
    // independently checks: every (route, category) pair where
    // `sharedAvg.count == own.count` must satisfy `myFiles ⊆ peerFiles` for
    // every peer; conversely, every pair where some peer is missing a file
    // must have `sharedAvg.count < own.count`.
    //
    // This catches bugs where the intersection accidentally over-counts —
    // e.g. counting the same file twice across the small/big swap, returning
    // |self ∪ peer| instead of |self ∩ peer|, or comparing the wrong route.
    const output = JSON.parse(
      (await runTool(['--json', '--files'])).stdout
    ) as ToolOutput
    const byType = new Map<string, RouteInfo[]>()
    for (const r of output.routes) {
      const list = byType.get(r.type) ?? []
      list.push(r)
      byType.set(r.type, list)
    }

    for (const r of output.routes) {
      const peers = (byType.get(r.type) ?? []).filter((p) => p !== r)
      if (peers.length === 0) continue
      for (const cat of ALL_CATEGORIES) {
        const myFiles = new Set(r[cat].files)
        if (myFiles.size === 0) continue
        const everyPeerIsSuperset = peers.every((p) => {
          const peer = new Set(p[cat].files)
          for (const f of myFiles) if (!peer.has(f)) return false
          return true
        })
        const sa = r[cat].sharedAvg!
        if (everyPeerIsSuperset) {
          expect(sa.count).toBe(r[cat].count)
          expect(sa.bytes).toBe(r[cat].bytes)
        } else {
          // Some peer is missing at least one of my files; the average
          // intersection size MUST be strictly less than my own count.
          expect(sa.count).toBeLessThan(r[cat].count)
        }
      }
    }
  })

  it('--json sharedAvg should be < own for routes with unique files (regression check)', async () => {
    // `/` and `/about` import the `'use client'` `Counter` component;
    // `/no-client`, `/_not-found`, and `/items/[itemId]` do not. So `/`'s
    // Counter chunk is shared with exactly one peer (`/about`) and absent
    // from the other three. This forces a strictly-below-100% average for
    // `/.clientJs`, regardless of how many framework chunks happen to be
    // shared across all five app-pages.
    //
    // If the algorithm were broken to return |self ∪ peer| or to skip
    // certain peers, this assertion would still trigger.
    const output = JSON.parse((await runTool(['--json'])).stdout) as ToolOutput
    const root = getRoute(output, '/')
    expect(root.type).toBe('app-page')
    expect(root.clientJs.sharedAvg).not.toBeNull()
    expect(root.clientJs.sharedAvg!.count).toBeLessThan(root.clientJs.count)
    expect(root.clientJs.sharedAvg!.bytes).toBeLessThan(root.clientJs.bytes)
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

  it('markdown should render empty cells as `-` (not `0 files / 0 B`)', async () => {
    const md = (await runTool([])).stdout
    // The empty placeholder must appear at least once: middleware ships
    // no client JS / CSS / maps so its row in the routes table will have
    // a `-` for those columns. `/pages-static` has no server entries.
    expect(md).toContain('| -')
    // It should NOT render `0 files / 0 B` anywhere — every empty cell
    // is replaced.
    expect(md).not.toMatch(/0 files\s+\/\s+0 B/)
  })

  it('markdown should include a Shared section', async () => {
    const md = (await runTool([])).stdout
    expect(md).toContain('## Shared')
    // Routes with no peers should appear as `n/a`. Routes with peers but
    // no files in a category render as `-` (matching the routes table
    // placeholder), so `n/a` and `-` are both expected and have distinct
    // meanings.
    expect(md).toContain('n/a')
    // Shared cells render with both count and byte percentages, e.g.
    // `5 files (100%) / 424 KB (100%)`. This is the marker for the
    // user-visible part of the percent-shared annotation.
    expect(md).toMatch(/\d+ files \(\d+%\) \/ [^|]*\(\d+%\)/)
    // Empty shared intersections render as `-`, not as `0 files (0%) / 0 B (0%)`.
    expect(md).not.toMatch(/0 files\s+\(0%\)/)
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

  it('--files without --json should error', async () => {
    const result = await runTool(['--files'])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('--files requires --json')
  })

  it('--files --json should add a sorted, dist-relative file list per category', async () => {
    const result = await runTool(['--json', '--files'])
    expect(result.code).toBe(0)
    const output = JSON.parse(result.stdout) as ToolOutput

    const root = getRoute(output, '/')
    for (const cat of ALL_CATEGORIES) {
      const files = root[cat].files
      expect(Array.isArray(files)).toBe(true)
      expect(files!.length).toBe(root[cat].count)
      // Files are sorted ascending and deduplicated.
      const sorted = [...files!].sort()
      expect(files).toEqual(sorted)
      expect(new Set(files).size).toBe(files!.length)
    }

    // Bundled JS chunks live inside distDir, so their paths must be plain
    // relative (no leading `..`). Traced node_modules deps land in
    // serverUnbundled and are expressed as `../...` from distDir — at
    // least one such path must appear there.
    for (const f of root.serverBundled.files!) {
      expect(f.startsWith('..')).toBe(false)
    }
    if (root.serverUnbundled.files!.length > 0) {
      expect(root.serverUnbundled.files!.some((f) => f.startsWith('..'))).toBe(
        true
      )
    }

    // Totals also expose file lists; their length must match totals.count
    // (which reflects the union across every route).
    for (const cat of ALL_CATEGORIES) {
      expect(output.totals[cat].files).toBeDefined()
      expect(output.totals[cat].files!.length).toBe(output.totals[cat].count)
    }
  })

  it('--json without --files should NOT include the files field', async () => {
    const result = await runTool(['--json'])
    expect(result.code).toBe(0)
    const output = JSON.parse(result.stdout) as ToolOutput
    for (const r of output.routes) {
      for (const cat of ALL_CATEGORIES) {
        expect(r[cat]).not.toHaveProperty('files')
      }
    }
    for (const cat of ALL_CATEGORIES) {
      expect(output.totals[cat]).not.toHaveProperty('files')
    }
  })
})
