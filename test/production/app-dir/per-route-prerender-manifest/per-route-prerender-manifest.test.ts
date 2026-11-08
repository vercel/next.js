import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { NextAdapter } from 'next'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

// Segment configs that Cache Components rejects at build time.
const isCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

const ROUTE_MANIFEST = 'route-prerender-manifest.json'

// The fields of a prerendered path that a route reads while it serves a
// request. A route's manifest keeps these and drops the others.
const RUNTIME_ROUTE_FIELDS = [
  'dataRoute',
  'srcRoute',
  'renderingMode',
  'initialRevalidateSeconds',
  'initialExpireSeconds',
  'prefetchDataRoute',
]

type Probe = {
  name: string
  // The route's entry below `.next/server`.
  entry: string
  url: string
  // What a router in front of the function sends as `x-matched-path`.
  matchedPath: string
  method?: string
  headers?: Record<string, string>
}

type AdapterOutputs = Parameters<NextAdapter['onBuildComplete']>[0]['outputs']
type NodeOutput = AdapterOutputs[
  | 'pages'
  | 'pagesApi'
  | 'appPages'
  | 'appRoutes'][number]

const RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'x-nextjs-cache',
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
  // The entry of each page below `.next/server`, without the extension.
  let entries: Record<string, string>
  let outputs: AdapterOutputs
  let nodeOutputs: NodeOutput[]

  function readJSON(file: string) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }

  /** The files below `dir` that are named `name` or end in `.<name>`. */
  function findFiles(dir: string, name: string, found: string[] = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        findFiles(file, name, found)
      } else if (entry.name === name || entry.name.endsWith(`.${name}`)) {
        found.push(file)
      }
    }
    return found
  }

  const relativeToDist = (file: string) =>
    path.relative(distDir, file).replace(/\\/g, '/')

  /**
   * Sends every probe to one fresh launcher process whose working directory is
   * `cwd`: the project, or a function assembled from adapter outputs. With
   * `server`, the launcher runs the project as a custom server instead of
   * calling the entry of each probe.
   */
  async function runLauncher(
    cwd: string,
    requests: Probe[],
    { server = false }: { server?: boolean } = {}
  ) {
    let launcher: ChildProcess | undefined
    try {
      const port = await findPort()
      launcher = spawn(
        'node',
        [path.join(next.testDir, 'adapter-launcher.js')],
        {
          cwd,
          env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'production',
            ...(server ? { TEST_SERVER: '1' } : {}),
          },
          stdio: 'pipe',
        }
      )
      let output = ''
      launcher.stdout?.on('data', (chunk) => (output += chunk))
      launcher.stderr?.on('data', (chunk) => (output += chunk))
      await retry(async () => {
        expect(output).toContain('adapter launcher ready')
      })

      const responses: Record<
        string,
        { status: number; headers: Record<string, string>; text?: string }
      > = {}
      for (const probe of requests) {
        const res = await fetch(`http://localhost:${port}${probe.url}`, {
          method: probe.method,
          headers: server
            ? probe.headers
            : {
                'x-test-entry': probe.entry,
                'x-matched-path': probe.matchedPath,
                ...probe.headers,
              },
        })
        const body = (await res.text()).replace(/<!-- -->/g, '')
        responses[probe.name] = {
          status: res.status,
          headers: Object.fromEntries(
            RESPONSE_HEADERS.filter((name) => res.headers.has(name)).map(
              (name) => [name, res.headers.get(name)!]
            )
          ),
          // The text that each route of the fixture renders, or else the
          // built-in not-found page.
          text: (/(app|pages) [a-z -]+ (page|route)( \w+)?/.exec(body) ??
            /could not be found/.exec(body))?.[0],
        }
      }

      const manifestReads: string[] = await (
        await fetch(`http://localhost:${port}/__manifest-reads`)
      ).json()

      return {
        responses,
        // A read that failed starts with `!`.
        manifestReads: manifestReads.filter((file) => !file.startsWith('!')),
        missingManifests: manifestReads
          .filter((file) => file.startsWith('!'))
          .map((file) => file.slice(1)),
        output,
      }
    } finally {
      launcher?.kill()
    }
  }

  /** Runs `run` while the project lacks the given prerender manifests. */
  async function withoutManifests<T>(hidden: string[], run: () => Promise<T>) {
    for (const file of hidden) {
      fs.renameSync(file, `${file}.hidden`)
    }
    try {
      return await run()
    } finally {
      for (const file of hidden) {
        fs.renameSync(`${file}.hidden`, file)
      }
    }
  }

  /**
   * Runs every probe against the project while it only has the given kind of
   * prerender manifest: the per-route ones (`route`), or the complete one, like
   * an output that predates the per-route manifests (`complete`).
   */
  function runProbes(manifests: 'route' | 'complete') {
    return withoutManifests(
      manifests === 'route' ? [completeManifestPath] : routeManifestPaths,
      () => runLauncher(next.testDir, probes)
    )
  }

  function getOutput(pathname: string) {
    const output = nodeOutputs.find(
      (candidate) => candidate.pathname === pathname
    )
    if (!output) {
      throw new Error(`no output for ${pathname}`)
    }
    return output
  }

  // The manifest of a route is in the directory named after its entry file,
  // except for some routes below a directory named `index`. The bundlers name
  // the entry of such a route differently (`pages/index/[slug].js` or
  // `pages/index/index/[slug].js`), and the manifest is in the same place with
  // each of them. Page to that directory below `.next/server`.
  const INDEX_ROUTES: Record<string, string> = {
    '/index': 'pages/index/index',
    '/index/foo': 'pages/index/index/foo',
    '/index/[slug]': 'pages/index/index/[slug]',
    '/index/[slug]/[id]': 'pages/index/index/[slug]/[id]',
    '/index/[...all]': 'pages/index/index/[...all]',
    '/index/handler/route': 'app/index/handler/route',
    '/index/[slug]/data/route': 'app/index/[slug]/data/route',
  }

  /** The manifest of an entry below `.next/server`, relative to `.next`. */
  function manifestOf(entry: string) {
    const page = Object.keys(INDEX_ROUTES).find(
      (candidate) => entries[candidate] === entry
    )
    return `server/${page ? INDEX_ROUTES[page] : entry}/${ROUTE_MANIFEST}`
  }

  /** The entry file that a route manifest belongs to, relative to `.next`. */
  function entryOf(manifest: string) {
    const directory = manifest.slice(
      'server/'.length,
      -ROUTE_MANIFEST.length - 1
    )
    const page = Object.keys(INDEX_ROUTES).find(
      (candidate) => INDEX_ROUTES[candidate] === directory
    )
    return `server/${page ? entries[page] : directory}.js`
  }

  /** The entry of an output below `.next/server`, without the extension. */
  function getEntry(output: NodeOutput) {
    return relativeToDist(output.filePath).replace(/^server\/|\.js$/g, '')
  }

  /**
   * Builds a function the way a deployment adapter does: the build output files
   * among the `assets` of an output plus its entry. A Pages Router function also
   * gets the output of the page that renders a 404. Dependencies outside the
   * build output resolve from the project above the function.
   */
  function assembleFunction(name: string, pathname: string) {
    const functionDir = path.join(next.testDir, 'functions', name)
    const output = getOutput(pathname)
    const merged = [output]
    if (output.type === 'PAGES') {
      merged.push(getOutput('/404'))
    }
    for (const { assets, filePath } of merged) {
      for (const file of [...Object.values(assets), filePath]) {
        const relative = path.relative(distDir, file)
        if (relative.startsWith('..')) continue
        const target = path.join(functionDir, '.next', relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(file, target)
      }
    }
    return {
      functionDir,
      entry: getEntry(output),
      manifests: findFiles(functionDir, ROUTE_MANIFEST)
        .concat(findFiles(functionDir, 'prerender-manifest.json'))
        .map((file) => path.relative(functionDir, file).replace(/\\/g, '/'))
        .sort(),
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
    routeManifestPaths = findFiles(path.join(distDir, 'server'), ROUTE_MANIFEST)
    entries = Object.fromEntries(
      Object.entries<string>({
        ...readJSON(path.join(distDir, 'server/pages-manifest.json')),
        ...readJSON(path.join(distDir, 'server/app-paths-manifest.json')),
      }).map(([page, file]) => [page, file.replace(/\.js$/, '')])
    )

    outputs = readJSON(path.join(next.testDir, 'build-complete.json')).outputs
    nodeOutputs = [
      ...outputs.pages,
      ...outputs.pagesApi,
      ...outputs.appPages,
      ...outputs.appRoutes,
    ].filter((output) => output.runtime === 'nodejs')

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
        name: 'app page that calls notFound',
        entry: 'app/missing/page',
        url: '/missing',
        matchedPath: '/missing',
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
      {
        name: 'app parallel route, the other slot of the same path',
        entry: 'app/par/@other/deep/page',
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
            {
              name: 'app prerendered route handler',
              entry: 'app/legacy/handler/route',
              url: '/legacy/handler',
              matchedPath: '/legacy/handler',
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
      {
        name: 'pages dynamic page in a directory named index, prerendered path',
        entry: entries['/index/[slug]'],
        url: '/index/a',
        matchedPath: '/index/a',
      },
      {
        name: 'pages dynamic page in a directory named index, new path',
        entry: entries['/index/[slug]'],
        url: '/index/b?nxtPslug=b',
        matchedPath: '/index/[slug]',
      },
      {
        name: 'pages static page in a directory named index',
        entry: entries['/index/foo'],
        url: '/index/foo',
        matchedPath: '/index/foo',
      },
      {
        name: 'app route handler in a directory named index',
        entry: entries['/index/handler/route'],
        url: '/index/handler',
        matchedPath: '/index/handler',
      },
    ]
  })

  it('gives every route a manifest with only its own entries', async () => {
    const complete = readJSON(completeManifestPath)
    const routes: Record<string, any> = {}
    const dynamicRoutes: Record<string, any> = {}
    const notFoundRoutes = new Set<string>()

    for (const file of routeManifestPaths) {
      const manifest = readJSON(file)
      // Two entries can prerender the same path (parallel routes). Each has
      // the entry, with the same data: that of the complete manifest.
      for (const [route, entry] of Object.entries<any>(manifest.routes)) {
        routes[route] = entry
        // Exactly the fields that a route reads, with the same values: a
        // route that lacks one serves with other caching headers.
        expect(complete.routes).toHaveProperty([route])
        const completeEntry = complete.routes[route]
        expect({ file, route, entry }).toStrictEqual({
          file,
          route,
          entry: Object.fromEntries(
            RUNTIME_ROUTE_FIELDS.filter((field) => field in completeEntry).map(
              (field) => [field, completeEntry[field]]
            )
          ),
        })
      }
      // A dynamic route's entry is whole.
      for (const [route, entry] of Object.entries<any>(
        manifest.dynamicRoutes
      )) {
        dynamicRoutes[route] = entry
        expect({ file, route, entry }).toStrictEqual({
          file,
          route,
          entry: complete.dynamicRoutes[route],
        })
      }
      // The paths of this route that returned `notFound`, and no other.
      expect({ file, notFoundRoutes: manifest.notFoundRoutes }).toStrictEqual({
        file,
        notFoundRoutes: complete.notFoundRoutes.filter(
          (route: string) => route in manifest.routes
        ),
      })
      for (const route of manifest.notFoundRoutes) notFoundRoutes.add(route)
    }

    // Together they hold what the complete manifest holds.
    expect(Object.keys(routes).sort()).toEqual(
      Object.keys(complete.routes).sort()
    )
    expect(dynamicRoutes).toEqual(complete.dynamicRoutes)
    expect([...notFoundRoutes].sort()).toEqual(
      [...complete.notFoundRoutes].sort()
    )
    expect(complete.notFoundRoutes).toEqual(['/gone/missing'])

    expect(routeManifestPaths.map(relativeToDist)).toEqual(
      expect.arrayContaining([
        `server/app/page/${ROUTE_MANIFEST}`,
        `server/app/isr/[slug]/page/${ROUTE_MANIFEST}`,
        `server/app/api/static/route/${ROUTE_MANIFEST}`,
        `server/app/(group)/grouped/page/${ROUTE_MANIFEST}`,
        `server/app/par/@slot/deep/page/${ROUTE_MANIFEST}`,
        `server/app/par/@other/deep/page/${ROUTE_MANIFEST}`,
        `server/pages/ssg/${ROUTE_MANIFEST}`,
        `server/pages/nested/${ROUTE_MANIFEST}`,
        `server/pages/blog/[slug]/${ROUTE_MANIFEST}`,
        `server/pages/api/hello/${ROUTE_MANIFEST}`,
        `server/pages/404/${ROUTE_MANIFEST}`,
        `server/pages/500/${ROUTE_MANIFEST}`,
        `server/pages/_error/${ROUTE_MANIFEST}`,
        // Below a directory named `index`.
        ...Object.values(INDEX_ROUTES).map(
          (directory) => `server/${directory}/${ROUTE_MANIFEST}`
        ),
        `server/pages/indexes/[id]/${ROUTE_MANIFEST}`,
        `server/pages/api/${ROUTE_MANIFEST}`,
        `server/pages/api/index/[id]/${ROUTE_MANIFEST}`,
        `server/app/(group)/index/in-group/page/${ROUTE_MANIFEST}`,
      ])
    )
    // No other file of the build output has the name of the complete manifest.
    expect(
      findFiles(distDir, 'prerender-manifest.json').map(relativeToDist)
    ).toEqual(['prerender-manifest.json'])

    expect(
      readJSON(path.join(distDir, 'server/pages/gone/[slug]', ROUTE_MANIFEST))
    ).toMatchObject({
      routes: {
        '/gone/a': expect.anything(),
        '/gone/missing': expect.anything(),
      },
      dynamicRoutes: { '/gone/[slug]': expect.anything() },
      notFoundRoutes: ['/gone/missing'],
    })

    // Both entries of the parallel route prerender `/par/deep`.
    const slot = readJSON(
      path.join(distDir, 'server/app/par/@slot/deep/page', ROUTE_MANIFEST)
    )
    const other = readJSON(
      path.join(distDir, 'server/app/par/@other/deep/page', ROUTE_MANIFEST)
    )
    expect(slot.routes).toHaveProperty(['/par/deep'])
    expect(other).toEqual(slot)
  })

  it("lists a route's manifest in its file trace, and not the complete one", async () => {
    const traces = findFiles(
      path.join(distDir, 'server/app'),
      'js.nft.json'
    ).concat(
      [
        'ssg',
        'nested',
        'blog/[slug]',
        'ssr',
        'api/hello',
        '_error',
        // Automatically static pages: their entries are still outputs.
        '404',
        '500',
      ]
        .map((entry) => `pages/${entry}`)
        .concat(
          ['/index/[slug]', '/index/[slug]/[id]', '/index/[...all]'].map(
            (page) => entries[page]
          )
        )
        .map((entry) => path.join(distDir, 'server', `${entry}.js.nft.json`))
    )
    expect(traces.length).toBeGreaterThan(15)

    for (const trace of traces) {
      const entry = relativeToDist(trace).slice(
        'server/'.length,
        -'.js.nft.json'.length
      )
      const manifests = (readJSON(trace).files as string[])
        .filter((file) => file.endsWith('prerender-manifest.json'))
        .map((file) => relativeToDist(path.join(path.dirname(trace), file)))
      // `page.js.nft.json` lists `page/route-prerender-manifest.json`.
      expect({ entry, manifests }).toEqual({
        entry,
        manifests: [manifestOf(entry)],
      })
      expect(fs.existsSync(path.join(distDir, manifests[0]))).toBe(true)
    }
  })

  it('writes every prerender manifest that a file trace lists', async () => {
    const listed = new Set<string>()
    for (const trace of findFiles(distDir, 'nft.json')) {
      for (const file of readJSON(trace).files as string[]) {
        if (path.basename(file) === ROUTE_MANIFEST) {
          listed.add(relativeToDist(path.join(path.dirname(trace), file)))
        }
      }
    }

    // Every manifest that a trace lists was written, and every manifest that
    // was written is listed by the trace of its route.
    expect(listed.size).toBeGreaterThan(20)
    expect([...listed].sort()).toEqual(
      routeManifestPaths.map(relativeToDist).sort()
    )
  })

  it('serves every route from its own manifest', async () => {
    const own = await runProbes('route')
    const complete = await runProbes('complete')

    // The 404 of the Pages Router is rendered by the not-found page.
    const served = [
      ...new Set(probes.map((probe) => probe.entry)),
      'app/_not-found/page',
    ]
      .map((entry) => `.next/${manifestOf(entry)}`)
      .sort()

    // The complete manifest was not there to be read.
    expect(own.manifestReads.sort()).toEqual(served)
    expect(own.missingManifests).toEqual([])
    // A route without a manifest of its own falls back to the complete one.
    expect(complete.manifestReads).toEqual(['.next/prerender-manifest.json'])
    expect(complete.missingManifests.sort()).toEqual(served)

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
      'app page that calls notFound': {
        status: 404,
        text: 'could not be found',
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
      'pages dynamic page in a directory named index, prerendered path': {
        status: 200,
        text: 'pages index slug page a',
      },
      'pages dynamic page in a directory named index, new path': {
        status: 200,
        text: 'pages index slug page b',
      },
      'pages static page in a directory named index': {
        status: 200,
        text: 'pages index foo page',
      },
      'app route handler in a directory named index': {
        status: 200,
        text: 'app index handler route',
      },
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
    for (const response of Object.values(own.responses)) {
      expect(response.status).toBeLessThan(500)
    }
  })

  /**
   * Runs the project as a custom server while it lacks the given prerender
   * manifests, and checks its answers: they are the same whether a route reads
   * its own manifest or the complete one.
   */
  async function runServer(hidden: string[]) {
    // `entry` is the route module that serves the request. An automatically
    // static page is a file without one, and has no prerender data to read.
    const requests = [
      { url: '/auto', entry: '', text: 'pages automatically static page' },
      { url: '/ssg', entry: 'pages/ssg', text: 'pages ssg page' },
      { url: '/blog/a', entry: 'pages/blog/[slug]', text: 'pages blog page a' },
      { url: '/blog/b', entry: 'pages/blog/[slug]', text: 'pages blog page b' },
      { url: '/ssr', entry: 'pages/ssr', text: 'pages ssr page' },
      { url: '/api/hello', entry: 'pages/api/hello', text: 'pages api route' },
      {
        url: '/index/a',
        entry: entries['/index/[slug]'],
        text: 'pages index slug page a',
      },
      {
        url: '/index/handler',
        entry: entries['/index/handler/route'],
        text: 'app index handler route',
      },
      { url: '/', entry: 'app/page', text: 'app static page' },
      { url: '/isr/a', entry: 'app/isr/[slug]/page', text: 'app isr page a' },
      // The parameter of a new path streams in after the shell.
      { url: '/isr/b', entry: 'app/isr/[slug]/page', text: 'app isr page' },
      { url: '/dynamic', entry: 'app/dynamic/page', text: 'app dynamic page' },
      {
        url: '/api/static',
        entry: 'app/api/static/route',
        text: 'app static route handler',
      },
      ...(isCacheComponents
        ? []
        : [
            {
              url: '/legacy/handler',
              entry: 'app/legacy/handler/route',
              text: 'app prerendered route handler',
            },
          ]),
      {
        url: '/no-such-page',
        entry: '',
        status: 404,
        text: 'could not be found',
      },
      // Only the manifest tells a server that an App Router route without
      // parameters is prerendered. It then answers no method but `GET` and
      // `HEAD`, and a middleware prefetch gets the page.
      {
        name: 'POST /',
        method: 'POST',
        url: '/',
        entry: 'app/page',
        status: 405,
      },
      ...(isCacheComponents
        ? []
        : [
            {
              name: 'POST /legacy/handler',
              method: 'POST',
              url: '/legacy/handler',
              entry: 'app/legacy/handler/route',
              status: 405,
            },
          ]),
      {
        name: 'middleware prefetch of /',
        url: '/',
        headers: { 'x-middleware-prefetch': '1' },
        entry: 'app/page',
        text: 'app static page',
      },
    ].map((request) => ({
      ...request,
      name: request.name ?? request.url,
      status: request.status ?? 200,
      matchedPath: request.url,
    }))

    const result = await withoutManifests(hidden, () =>
      runLauncher(next.testDir, requests, { server: true })
    )

    expect(
      Object.fromEntries(
        requests.map(({ name }) => {
          const { status, text } = result.responses[name]
          return [name, { status, text }]
        })
      )
    ).toEqual(
      Object.fromEntries(
        requests.map(({ name, status, text }) => [
          name,
          { status, text: text && expect.stringContaining(text) },
        ])
      )
    )

    // A server takes the revalidation and expiry times of a prerendered path
    // from the manifest: without them the path is stale and has other caching
    // headers.
    const prerendered = {
      headers: {
        'cache-control': 's-maxage=31536000',
        'x-nextjs-cache': 'HIT',
      },
    }
    expect(result.responses).toMatchObject({
      '/': prerendered,
      '/isr/a': prerendered,
      '/blog/a': prerendered,
      '/ssg': {
        headers: {
          'cache-control': 's-maxage=10, stale-while-revalidate=31535990',
        },
      },
      ...(isCacheComponents ? {} : { '/legacy/handler': prerendered }),
    })

    return {
      ...result,
      // The manifests of the routes that served a request.
      routeManifests: requests
        .filter(({ entry }) => entry)
        .map(({ entry }) => `.next/${manifestOf(entry)}`),
    }
  }

  it('does not read the complete manifest in a server', async () => {
    const result = await runServer([])

    expect(result.manifestReads).toEqual(
      expect.arrayContaining(result.routeManifests)
    )
    expect(result.manifestReads).not.toContain('.next/prerender-manifest.json')
    expect(result.missingManifests).toEqual([])
  })

  it('reads the complete manifest in a server without per-route manifests', async () => {
    // Like an output that predates the per-route manifests, or a server whose
    // files were copied without them.
    const result = await runServer(routeManifestPaths)

    // Once, for all routes.
    expect(result.manifestReads).toEqual(['.next/prerender-manifest.json'])
  })

  it('fails a route in a server that has no prerender manifest', async () => {
    // Neither the manifests of the routes nor the complete one. A route does
    // not serve without its prerender data: the server answers 500 and logs
    // the complete manifest that it could not open.
    const requests = ['/ssg', '/api/hello', '/isr/a', '/api/static'].map(
      (url) => ({ name: url, entry: '', url, matchedPath: url })
    )

    const result = await withoutManifests(
      [completeManifestPath, ...routeManifestPaths],
      () => runLauncher(next.testDir, requests, { server: true })
    )

    expect(
      Object.fromEntries(
        requests.map(({ name }) => [name, result.responses[name].status])
      )
    ).toEqual(Object.fromEntries(requests.map(({ name }) => [name, 500])))
    expect(result.output).toContain(
      `ENOENT: no such file or directory, open '${completeManifestPath}'`
    )
    expect(result.manifestReads).toEqual([])
  })

  describe('in a function that an adapter assembles from the outputs', () => {
    it('finds the manifest of every route of the function', async () => {
      // Every output has the manifest of its entry among its assets, and not
      // the complete one. That includes the automatically static `/404` page,
      // which stays an output so that other pages can render it.
      expect(nodeOutputs.map((output) => output.pathname)).toEqual(
        expect.arrayContaining(['/404', '/_error', '/gone/[slug]'])
      )
      for (const output of nodeOutputs) {
        const { pathname } = output
        if (!fs.existsSync(output.filePath)) {
          // Where a bundler names an entry differently below a directory named
          // `index`, the output names an entry file that does not exist, and
          // has no assets. That is so without the per-route manifests too.
          expect([
            'pages/index/[slug]',
            'pages/index/[slug]/[id]',
            'pages/index/[...all]',
            'app/index/handler/route',
          ]).toContain(getEntry(output))
          expect(output.assets).toEqual({})
          continue
        }
        const files = [...Object.values(output.assets), output.filePath].map(
          relativeToDist
        )
        const manifests = files.filter((file) =>
          file.endsWith('prerender-manifest.json')
        )
        expect({ pathname, manifests }).toEqual({
          pathname,
          manifests: expect.arrayContaining([manifestOf(getEntry(output))]),
        })
        // An output can hold more entries (the slots of a parallel route),
        // each with its manifest. It holds no manifest of another route.
        expect({
          pathname,
          entries: manifests.map((file) => files.includes(entryOf(file))),
        }).toEqual({ pathname, entries: manifests.map(() => true) })
      }

      // A Pages Router page and the not-found page that it renders.
      const gone = assembleFunction('gone', '/gone/[slug]')
      expect(gone.manifests).toEqual([
        `.next/server/pages/404/${ROUTE_MANIFEST}`,
        `.next/server/pages/gone/[slug]/${ROUTE_MANIFEST}`,
      ])
      const goneResult = await runLauncher(gone.functionDir, [
        {
          name: 'notFound from getStaticProps',
          entry: gone.entry,
          url: '/gone/also-missing?nxtPslug=also-missing',
          matchedPath: '/gone/[slug]',
        },
        {
          name: 'prerendered path',
          entry: gone.entry,
          url: '/gone/a',
          matchedPath: '/gone/a',
        },
      ])
      expect(goneResult.responses).toMatchObject({
        'notFound from getStaticProps': {
          status: 404,
          text: 'pages not-found page',
        },
        'prerendered path': { status: 200, text: 'pages gone page a' },
      })
      expect(goneResult.manifestReads.sort()).toEqual(gone.manifests)
      expect(goneResult.missingManifests).toEqual([])

      // A path that `fallback: false` excludes.
      const fallbackFalse = assembleFunction('fb-false', '/fb-false/[slug]')
      const fallbackFalseResult = await runLauncher(fallbackFalse.functionDir, [
        {
          name: 'fallback false miss',
          entry: fallbackFalse.entry,
          url: '/fb-false/b?nxtPslug=b',
          matchedPath: '/fb-false/[slug]',
        },
      ])
      expect(fallbackFalseResult.responses).toMatchObject({
        'fallback false miss': { status: 404, text: 'pages not-found page' },
      })
      expect(fallbackFalseResult.manifestReads.sort()).toEqual(
        fallbackFalse.manifests
      )
      expect(fallbackFalseResult.missingManifests).toEqual([])

      // The error pages as functions of their own, and an App Router page
      // that renders its own not-found boundary. The router in front of a
      // function sets the status of an error page, so only the content and
      // the manifests are checked.
      for (const [pathname, text] of [
        ['/404', 'pages not-found page'],
        ['/_error', undefined],
        ['/missing', 'could not be found'],
      ] as const) {
        const fn = assembleFunction(
          `own${pathname.replace('/', '-')}`,
          pathname
        )
        const result = await runLauncher(fn.functionDir, [
          {
            name: 'page',
            entry: fn.entry,
            url: pathname,
            matchedPath: pathname,
          },
        ])
        expect({ pathname, output: result.output }).toEqual({
          pathname,
          output: expect.not.stringContaining('handler error'),
        })
        if (text) {
          expect({ pathname, text: result.responses.page.text }).toEqual({
            pathname,
            text,
          })
        }
        expect({ pathname, reads: result.manifestReads }).toEqual({
          pathname,
          reads: [`.next/${manifestOf(fn.entry)}`],
        })
        expect(result.missingManifests).toEqual([])
      }
    })

    it('fails a route that finds no prerender manifest', async () => {
      // Neither the route's manifest nor the complete one. The route does not
      // serve without its prerender data: every request fails on the complete
      // manifest that it could not open.
      const gone = assembleFunction('gone-no-manifest', '/gone/[slug]')
      for (const file of gone.manifests) {
        fs.rmSync(path.join(gone.functionDir, file))
      }
      const result = await runLauncher(gone.functionDir, [
        {
          name: 'prerendered path',
          entry: gone.entry,
          url: '/gone/a',
          matchedPath: '/gone/a',
        },
        {
          name: 'new path',
          entry: gone.entry,
          url: '/gone/b?nxtPslug=b',
          matchedPath: '/gone/[slug]',
        },
      ])
      expect(result.responses).toEqual({
        'prerendered path': { status: 500, headers: {} },
        'new path': { status: 500, headers: {} },
      })
      expect(result.output).toContain(
        `ENOENT: no such file or directory, open '${path.join(
          gone.functionDir,
          '.next',
          'prerender-manifest.json'
        )}'`
      )
      expect(result.manifestReads).toEqual([])
      // Each request looks for the complete manifest again.
      expect(
        result.missingManifests.filter(
          (file) => file === '.next/prerender-manifest.json'
        )
      ).toHaveLength(2)
    })

    it('fails a route whose manifest cannot be parsed', async () => {
      // A manifest that is there but damaged is not skipped: the route would
      // serve with the prerender data of no route at all.
      const fn = assembleFunction('damaged', '/ssg')
      const manifest = path.join(
        fn.functionDir,
        '.next/server/pages/ssg',
        ROUTE_MANIFEST
      )
      const probe = {
        name: 'page',
        entry: fn.entry,
        url: '/ssg',
        matchedPath: '/ssg',
      }

      for (const content of ['', '{"version":4,"routes":{']) {
        fs.writeFileSync(manifest, content)
        const result = await runLauncher(fn.functionDir, [probe])
        expect({ content, status: result.responses.page.status }).toEqual({
          content,
          status: 500,
        })
        expect(result.output).toContain('SyntaxError')
      }
    })
  })
})
