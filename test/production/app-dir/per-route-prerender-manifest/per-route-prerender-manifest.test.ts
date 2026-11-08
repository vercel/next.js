import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

// Segment configs that Cache Components rejects at build time.
const isCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

type Probe = {
  name: string
  // The route's entry below `.next/server`.
  entry: string
  url: string
  // What a router in front of the function sends as `x-matched-path`.
  matchedPath: string
  headers?: Record<string, string>
}

const RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'x-nextjs-postponed',
  'x-nextjs-prerender',
  'x-next-cache-tags',
  'x-nextjs-stale-time',
]

// This suite calls the compiled route handlers of a local build directly,
// which deployment tests cannot reproduce.
// @force-gate !deploy
describe('per-route-prerender-manifest', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let distDir: string
  let completeManifestPath: string
  let routeManifestPaths: string[]
  let probes: Probe[]

  function readJSON(file: string) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  function findFiles(dir: string, name: string, found: string[] = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        findFiles(file, name, found)
      } else if (entry.name === name) {
        found.push(file)
      }
    }
    return found
  }

  /**
   * Runs every probe in one fresh process that only sees the given kind of
   * prerender manifest, like a function that an adapter assembled from a
   * route's file trace (`route`) or from an output that predates the
   * per-route manifests (`complete`).
   */
  async function runProbes(manifests: 'route' | 'complete') {
    const hidden =
      manifests === 'route' ? [completeManifestPath] : routeManifestPaths
    for (const file of hidden) {
      fs.renameSync(file, `${file}.hidden`)
    }

    let launcher: ChildProcess | undefined
    try {
      const port = await findPort()
      launcher = spawn(
        'node',
        [path.join(next.testDir, 'adapter-launcher.js')],
        {
          cwd: next.testDir,
          env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
          stdio: 'pipe',
        }
      )
      let output = ''
      launcher.stdout?.on('data', (chunk) => (output += chunk))
      launcher.stderr?.on('data', (chunk) => (output += chunk))
      await retry(async () => {
        expect(output).toContain('adapter launcher ready')
      })

      const responses: Record<string, unknown> = {}
      for (const probe of probes) {
        const res = await fetch(`http://localhost:${port}${probe.url}`, {
          headers: {
            'x-test-entry': probe.entry,
            'x-matched-path': probe.matchedPath,
            ...probe.headers,
          },
        })
        const body = await res.text()
        responses[probe.name] = {
          status: res.status,
          headers: Object.fromEntries(
            RESPONSE_HEADERS.filter((name) => res.headers.has(name)).map(
              (name) => [name, res.headers.get(name)]
            )
          ),
          // The text that each route of the fixture renders.
          text: /(app|pages) [a-z -]+ (page|route)( \w+)?/.exec(
            body.replace(/<!-- -->/g, '')
          )?.[0],
        }
      }

      const manifestReads: string[] = await (
        await fetch(`http://localhost:${port}/__manifest-reads`)
      ).json()

      return { responses, manifestReads, output }
    } finally {
      launcher?.kill()
      for (const file of hidden) {
        fs.renameSync(`${file}.hidden`, file)
      }
    }
  }

  beforeAll(async () => {
    if (isCacheComponents) {
      await next.remove('app/legacy')
    }
    const { exitCode, cliOutput } = await next.build()
    if (exitCode !== 0) {
      throw new Error(`next build failed:\n${cliOutput}`)
    }

    distDir = path.join(next.testDir, '.next')
    completeManifestPath = path.join(distDir, 'prerender-manifest.json')
    routeManifestPaths = findFiles(
      path.join(distDir, 'server'),
      'route-prerender-manifest.json'
    )

    const { previewModeId } = readJSON(
      path.join(distDir, 'server/preview-props.json')
    )
    const buildId = fs.readFileSync(path.join(distDir, 'BUILD_ID'), 'utf8')
    const revalidate = { 'x-prerender-revalidate': previewModeId }

    probes = [
      {
        name: 'app static page',
        entry: 'app/page',
        url: '/',
        matchedPath: '/',
      },
      {
        name: 'app prerendered param',
        entry: 'app/isr/[slug]/page',
        url: '/isr/a',
        matchedPath: '/isr/a',
      },
      {
        name: 'app new param',
        entry: 'app/isr/[slug]/page',
        url: '/isr/b?nxtPslug=b',
        matchedPath: '/isr/[slug]',
      },
      {
        name: 'app on-demand revalidation',
        entry: 'app/isr/[slug]/page',
        url: '/isr/a',
        matchedPath: '/isr/a',
        headers: revalidate,
      },
      {
        name: 'app on-demand revalidation of a path that was not generated',
        entry: 'app/isr/[slug]/page',
        url: '/isr/c?nxtPslug=c',
        matchedPath: '/isr/[slug]',
        headers: { ...revalidate, 'x-prerender-revalidate-if-generated': '1' },
      },
      {
        name: 'app draft mode',
        entry: 'app/isr/[slug]/page',
        url: '/isr/a',
        matchedPath: '/isr/a',
        headers: { cookie: `__prerender_bypass=${previewModeId}` },
      },
      {
        name: 'app rsc request',
        entry: 'app/isr/[slug]/page',
        url: '/isr/a.rsc',
        matchedPath: '/isr/a.rsc',
        headers: { rsc: '1' },
      },
      {
        name: 'app dynamic page',
        entry: 'app/dynamic/page',
        url: '/dynamic',
        matchedPath: '/dynamic',
      },
      {
        name: 'app static route handler',
        entry: 'app/api/static/route',
        url: '/api/static',
        matchedPath: '/api/static',
      },
      {
        name: 'app dynamic route handler',
        entry: 'app/api/dynamic/route',
        url: '/api/dynamic',
        matchedPath: '/api/dynamic',
        headers: { 'x-probe': '1' },
      },
      {
        name: 'app route group',
        entry: 'app/(group)/grouped/page',
        url: '/grouped',
        matchedPath: '/grouped',
      },
      {
        name: 'app parallel route slot',
        entry: 'app/par/@slot/deep/page',
        url: '/par/deep',
        matchedPath: '/par/deep',
      },
      ...(isCacheComponents
        ? []
        : [
            {
              name: 'app revalidate config',
              entry: 'app/legacy/revalidate/[slug]/page',
              url: '/legacy/revalidate/a',
              matchedPath: '/legacy/revalidate/a',
            },
            {
              name: 'app dynamicParams false',
              entry: 'app/legacy/strict/[slug]/page',
              url: '/legacy/strict/a',
              matchedPath: '/legacy/strict/a',
            },
          ]),
      {
        name: 'pages getStaticProps',
        entry: 'pages/ssg',
        url: '/ssg',
        matchedPath: '/ssg',
      },
      {
        name: 'pages getStaticProps data request',
        entry: 'pages/ssg',
        url: `/_next/data/${buildId}/ssg.json`,
        matchedPath: `/_next/data/${buildId}/ssg.json`,
        headers: { 'x-nextjs-data': '1' },
      },
      {
        name: 'pages index file in a directory',
        entry: 'pages/nested',
        url: '/nested',
        matchedPath: '/nested',
      },
      {
        name: 'pages blocking fallback, prerendered path',
        entry: 'pages/blog/[slug]',
        url: '/blog/a',
        matchedPath: '/blog/a',
      },
      {
        name: 'pages blocking fallback, new path',
        entry: 'pages/blog/[slug]',
        url: '/blog/b?nxtPslug=b',
        matchedPath: '/blog/[slug]',
      },
      {
        name: 'pages on-demand revalidation',
        entry: 'pages/blog/[slug]',
        url: '/blog/a',
        matchedPath: '/blog/a',
        headers: revalidate,
      },
      {
        name: 'pages fallback false, prerendered path',
        entry: 'pages/fb-false/[slug]',
        url: '/fb-false/a',
        matchedPath: '/fb-false/a',
      },
      {
        name: 'pages fallback true, new path',
        entry: 'pages/fb-true/[slug]',
        url: '/fb-true/b?nxtPslug=b',
        matchedPath: '/fb-true/[slug]',
      },
      {
        name: 'pages fallback true, fallback shell',
        entry: 'pages/fb-true/[slug]',
        url: '/fb-true/[slug]',
        matchedPath: '/fb-true/[slug]',
      },
      {
        name: 'pages path that returned notFound at build',
        entry: 'pages/gone/[slug]',
        url: '/gone/missing',
        matchedPath: '/gone/missing',
      },
      {
        name: 'pages getServerSideProps',
        entry: 'pages/ssr',
        url: '/ssr',
        matchedPath: '/ssr',
      },
      {
        name: 'pages api route',
        entry: 'pages/api/hello',
        url: '/api/hello',
        matchedPath: '/api/hello',
      },
    ]
  })

  it('gives every route a manifest with only its own entries', async () => {
    const complete = readJSON(completeManifestPath)
    const routes: Record<string, any> = {}
    const dynamicRoutes: Record<string, any> = {}
    const notFoundRoutes: string[] = []

    for (const file of routeManifestPaths) {
      const manifest = readJSON(file)
      for (const [route, entry] of Object.entries<any>(manifest.routes)) {
        // No path is in the manifest of two routes.
        expect(routes).not.toHaveProperty([route])
        routes[route] = entry
        // The entry has a subset of the fields, with the same values.
        expect(complete.routes[route]).toMatchObject(entry)
      }
      for (const [route, entry] of Object.entries<any>(
        manifest.dynamicRoutes
      )) {
        expect(dynamicRoutes).not.toHaveProperty([route])
        dynamicRoutes[route] = entry
      }
      for (const route of manifest.notFoundRoutes) {
        expect(manifest.routes).toHaveProperty([route])
        notFoundRoutes.push(route)
      }
    }

    // Together they hold what the complete manifest holds.
    expect(Object.keys(routes).sort()).toEqual(
      Object.keys(complete.routes).sort()
    )
    expect(dynamicRoutes).toEqual(complete.dynamicRoutes)
    expect(notFoundRoutes.sort()).toEqual([...complete.notFoundRoutes].sort())
    expect(complete.notFoundRoutes).toEqual(['/gone/missing'])

    const relative = (file: string) =>
      path.relative(distDir, file).replace(/\\/g, '/')
    expect(routeManifestPaths.map(relative)).toEqual(
      expect.arrayContaining([
        'server/app/page/route-prerender-manifest.json',
        'server/app/isr/[slug]/page/route-prerender-manifest.json',
        'server/app/api/static/route/route-prerender-manifest.json',
        'server/app/(group)/grouped/page/route-prerender-manifest.json',
        'server/app/par/@slot/deep/page/route-prerender-manifest.json',
        'server/pages/ssg/route-prerender-manifest.json',
        'server/pages/nested/route-prerender-manifest.json',
        'server/pages/blog/[slug]/route-prerender-manifest.json',
        'server/pages/api/hello/route-prerender-manifest.json',
        'server/pages/_error/route-prerender-manifest.json',
      ])
    )
    expect(
      readJSON(
        path.join(
          distDir,
          'server/pages/gone/[slug]/route-prerender-manifest.json'
        )
      )
    ).toMatchObject({
      routes: {
        '/gone/a': expect.anything(),
        '/gone/missing': expect.anything(),
      },
      dynamicRoutes: { '/gone/[slug]': expect.anything() },
      notFoundRoutes: ['/gone/missing'],
    })
  })

  it("lists a route's manifest in its file trace, and not the complete one", async () => {
    const traces = findFiles(path.join(distDir, 'server'), 'page.js.nft.json')
      .concat(findFiles(path.join(distDir, 'server'), 'route.js.nft.json'))
      .concat(
        ['ssg', 'nested', 'blog/[slug]', 'ssr', 'api/hello', '_error'].map(
          (page) => path.join(distDir, 'server/pages', `${page}.js.nft.json`)
        )
      )
    expect(traces.length).toBeGreaterThan(10)

    for (const trace of traces) {
      const files: string[] = readJSON(trace).files
      const manifests = files.filter((file) =>
        file.endsWith('prerender-manifest.json')
      )
      // `page.js.nft.json` lists `page/route-prerender-manifest.json`.
      expect({ trace, manifests }).toEqual({
        trace,
        manifests: [
          `${path.basename(trace, '.js.nft.json')}/route-prerender-manifest.json`,
        ],
      })
      expect(fs.existsSync(path.join(path.dirname(trace), manifests[0]))).toBe(
        true
      )
    }
  })

  it('serves every route from its own manifest', async () => {
    const own = await runProbes('route')
    const complete = await runProbes('complete')

    // The complete manifest was not there to be read.
    expect(own.manifestReads.sort()).toEqual(
      [...new Set(probes.map((probe) => probe.entry))]
        .map((entry) => `.next/server/${entry}/route-prerender-manifest.json`)
        .sort()
    )
    // A route without a manifest of its own falls back to the complete one.
    expect(complete.manifestReads).toEqual(['.next/prerender-manifest.json'])

    expect(own.responses).toEqual(complete.responses)

    expect(own.responses).toMatchObject({
      'app static page': {
        status: 200,
        headers: { 'cache-control': 's-maxage=31536000' },
        text: 'app static page',
      },
      'app prerendered param': {
        status: 200,
        headers: { 'cache-control': 's-maxage=31536000' },
        text: 'app isr page a',
      },
      'app draft mode': {
        status: 200,
        headers: {
          'cache-control':
            'private, no-cache, no-store, max-age=0, must-revalidate',
        },
      },
      'app dynamic page': isCacheComponents
        ? { status: 200, headers: { 'x-nextjs-postponed': '1' } }
        : {
            status: 200,
            headers: {
              'cache-control':
                'private, no-cache, no-store, max-age=0, must-revalidate',
            },
          },
      'pages getStaticProps': {
        status: 200,
        headers: {
          'cache-control': 's-maxage=10, stale-while-revalidate=31535990',
        },
        text: 'pages ssg page',
      },
      'pages blocking fallback, new path': {
        status: 200,
        text: 'pages blog page b',
      },
      'pages path that returned notFound at build': { status: 404 },
      'pages getServerSideProps': {
        status: 200,
        headers: {
          'cache-control':
            'private, no-cache, no-store, max-age=0, must-revalidate',
        },
      },
      'pages api route': { status: 200, text: 'pages api route' },
    })
    if (!isCacheComponents) {
      expect(own.responses).toMatchObject({
        'app revalidate config': {
          status: 200,
          headers: {
            'cache-control': 's-maxage=60, stale-while-revalidate=31535940',
          },
        },
      })
    }
    for (const response of Object.values<any>(own.responses)) {
      expect(response.status).toBeLessThan(500)
    }
  })
})
