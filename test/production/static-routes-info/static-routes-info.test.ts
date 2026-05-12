import { nextTestSetup, isNextStart } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

interface CategoryStats {
  count: number
  bytes: number
}

interface RouteInfo {
  route: string
  type: string
  serverBundled: CategoryStats
  serverMaps: CategoryStats
  serverUnbundled: CategoryStats
  clientJs: CategoryStats
  clientMaps: CategoryStats
  clientCss: CategoryStats
}

interface ToolOutput {
  routes: RouteInfo[]
  totals: Omit<RouteInfo, 'route' | 'type'>
}

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
    expect(types).toContain('app-page') // app/page.tsx
    expect(types).toContain('app-route') // app/api/node/route.ts
    expect(types).toContain('edge-function') // app/api/edge/route.ts (runtime: 'edge')
    expect(types).toContain('pages') // pages/pages-ssr.tsx (getServerSideProps)
    expect(types).toContain('pages-static') // pages/pages-static.tsx
    expect(types).toContain('pages-api') // pages/api/hello.ts

    // Specific URLs should be present.
    const routes = output.routes.map((r) => r.route)
    expect(routes).toEqual(
      expect.arrayContaining([
        '/',
        '/api/node',
        '/api/edge',
        '/pages-ssr',
        '/pages-static',
        '/api/hello',
      ])
    )

    // Each category on each route is well-formed.
    for (const r of output.routes) {
      for (const cat of [
        'serverBundled',
        'serverMaps',
        'serverUnbundled',
        'clientJs',
        'clientMaps',
        'clientCss',
      ] as const) {
        expect(typeof r[cat].count).toBe('number')
        expect(typeof r[cat].bytes).toBe('number')
        // count/bytes consistency: 0 files ↔ 0 bytes; >0 files → >0 bytes.
        if (r[cat].count === 0) {
          expect(r[cat].bytes).toBe(0)
        } else {
          expect(r[cat].bytes).toBeGreaterThan(0)
        }
      }
    }
  })

  it('--json should expose the right files per route type', async () => {
    const result = await runTool(['--json'])
    const output = JSON.parse(result.stdout) as ToolOutput

    // app-page: has server JS. Per-route client JS / CSS for App Router
    // pages is read from `entryJSFiles` / `entryCSSFiles` in the
    // `_client-reference-manifest.js`, which Turbopack populates but
    // webpack does not (matching the existing `route-bundle-stats.ts`
    // behavior). The tool reports 0 for webpack.
    const appPage = getRoute(output, '/')
    expect(appPage.type).toBe('app-page')
    expect(appPage.serverBundled.count).toBeGreaterThan(0)
    if (isTurbopack) {
      expect(appPage.clientJs.count).toBeGreaterThan(0)
      expect(appPage.clientCss.count).toBeGreaterThan(0)
    }

    // app-route (Node runtime): has server JS, no client JS / CSS.
    const appRoute = getRoute(output, '/api/node')
    expect(appRoute.type).toBe('app-route')
    expect(appRoute.serverBundled.count).toBeGreaterThan(0)
    expect(appRoute.clientJs.count).toBe(0)
    expect(appRoute.clientCss.count).toBe(0)

    // edge-function: has server JS, no client JS, no nft.json (so unbundled
    // is always 0 — the bundle includes everything inline).
    const edgeRoute = getRoute(output, '/api/edge')
    expect(edgeRoute.type).toBe('edge-function')
    expect(edgeRoute.serverBundled.count).toBeGreaterThan(0)
    expect(edgeRoute.serverUnbundled.count).toBe(0)
    expect(edgeRoute.clientJs.count).toBe(0)

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
      'Server Bundled JS',
      'Server Maps',
      'Server Unbundled',
      'Client JS',
      'Client Maps',
      'Client CSS',
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
