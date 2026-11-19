import { stat } from 'fs/promises'
import { spawn } from 'child_process'
import { once } from 'events'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import type { NextAdapter } from 'next'

type AdapterBuildContext = Parameters<NextAdapter['onBuildComplete']>[0]

type Classification = {
  routeType: 'route' | 'page' | 'shell' | 'fallback'
  response: 'complete' | 'initial' | 'empty'
  compute: 'static' | 'resuming' | 'blocking' | 'dynamic'
}

const validClassifications: Classification[] = [
  { routeType: 'route', response: 'complete', compute: 'static' },
  { routeType: 'page', response: 'complete', compute: 'static' },
  { routeType: 'page', response: 'initial', compute: 'static' },
  { routeType: 'page', response: 'initial', compute: 'resuming' },
  { routeType: 'page', response: 'empty', compute: 'static' },
  { routeType: 'page', response: 'empty', compute: 'blocking' },
  { routeType: 'page', response: 'empty', compute: 'dynamic' },
  { routeType: 'shell', response: 'complete', compute: 'static' },
  { routeType: 'shell', response: 'initial', compute: 'static' },
  { routeType: 'shell', response: 'initial', compute: 'resuming' },
  { routeType: 'shell', response: 'empty', compute: 'dynamic' },
  { routeType: 'fallback', response: 'complete', compute: 'static' },
  { routeType: 'fallback', response: 'initial', compute: 'static' },
  { routeType: 'fallback', response: 'initial', compute: 'resuming' },
]

const classificationKey = ({ routeType, response, compute }: Classification) =>
  `${routeType}/${response}/${compute}`

describe('adapter-prerender-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getPrerenders() {
    const { outputs }: AdapterBuildContext = await next.readJSON(
      'build-complete.json'
    )
    return outputs.prerenders
  }

  async function getPrerenderManifest() {
    return next.readJSON('.next/prerender-manifest.json')
  }

  it('provides existing files for every prerender fallback', async () => {
    const prerenders = await getPrerenders()
    const files = prerenders.flatMap((output) =>
      output.fallback?.filePath ? [output.fallback.filePath] : []
    )
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect((await stat(file)).isFile()).toBe(true)
    }
  })

  it('exercises every valid classification combination', async () => {
    const cases: Array<
      Classification & {
        pathname: string
        manifestSection: 'routes' | 'dynamicRoutes'
      }
    > = [
      {
        pathname: '/static-route',
        manifestSection: 'routes',
        routeType: 'route',
        response: 'complete',
        compute: 'static',
      },
      {
        pathname: '/static',
        manifestSection: 'routes',
        routeType: 'page',
        response: 'complete',
        compute: 'static',
      },
      {
        pathname: '/client-hole',
        manifestSection: 'routes',
        routeType: 'page',
        response: 'initial',
        compute: 'static',
      },
      {
        pathname: '/ppr-shell',
        manifestSection: 'routes',
        routeType: 'page',
        response: 'initial',
        compute: 'resuming',
      },
      {
        pathname: '/ensure-static/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'page',
        response: 'empty',
        compute: 'static',
      },
      {
        pathname: '/blocking-param/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'page',
        response: 'empty',
        compute: 'blocking',
      },
      {
        pathname: '/empty-shell',
        manifestSection: 'routes',
        routeType: 'page',
        response: 'empty',
        compute: 'dynamic',
      },
      {
        pathname: '/combinations/fallback-complete-static/known/[rest]',
        manifestSection: 'dynamicRoutes',
        routeType: 'shell',
        response: 'complete',
        compute: 'static',
      },
      {
        pathname: '/combinations/shell-initial-static/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'shell',
        response: 'initial',
        compute: 'static',
      },
      {
        pathname: '/prefix/b/[two]',
        manifestSection: 'dynamicRoutes',
        routeType: 'shell',
        response: 'initial',
        compute: 'resuming',
      },
      {
        pathname: '/combinations/shell-empty-dynamic/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'shell',
        response: 'empty',
        compute: 'dynamic',
      },
      {
        pathname: '/combinations/fallback-complete-static/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'fallback',
        response: 'complete',
        compute: 'static',
      },
      {
        pathname: '/combinations/fallback-initial-static/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'fallback',
        response: 'initial',
        compute: 'static',
      },
      {
        pathname: '/blog/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'fallback',
        response: 'initial',
        compute: 'resuming',
      },
    ]

    const exercisedKeys = cases.map(classificationKey)
    const expectedKeys = validClassifications.map(classificationKey)
    expect(Array.from(new Set(exercisedKeys)).sort()).toEqual(
      expectedKeys.sort()
    )

    const prerenders = await getPrerenders()
    const manifest = await getPrerenderManifest()
    for (const { pathname, manifestSection, ...classification } of cases) {
      const output = prerenders.find(
        (prerender) => prerender.pathname === pathname
      )
      expect(output).toMatchObject(classification)
      expect(manifest[manifestSection][pathname]).toMatchObject(classification)
    }
  })

  it('persists canonical classifications in the prerender manifest', async () => {
    const manifest = await getPrerenderManifest()

    expect(manifest.routes['/static']).toMatchObject({
      renderingMode: 'PARTIALLY_STATIC',
      routeType: 'page',
      response: 'complete',
      compute: 'static',
      htmlSize: expect.any(Number),
    })
    expect(manifest.routes['/client-hole']).toMatchObject({
      routeType: 'page',
      response: 'initial',
      compute: 'static',
      htmlSize: expect.any(Number),
    })
    expect(manifest.routes['/empty-shell']).toMatchObject({
      routeType: 'page',
      response: 'empty',
      compute: 'dynamic',
      htmlSize: 0,
    })
    expect(manifest.dynamicRoutes['/blog/[slug]']).toMatchObject({
      routeType: 'fallback',
      response: 'initial',
      compute: 'resuming',
      htmlSize: expect.any(Number),
    })
    expect(manifest.dynamicRoutes['/blocking/[id]']).toMatchObject({
      routeType: 'page',
      response: 'empty',
      compute: 'blocking',
    })
    expect(manifest.dynamicRoutes['/static-fallback/[id]']).toMatchObject({
      routeType: 'fallback',
      response: 'initial',
      compute: 'static',
    })
    expect(manifest.routes['/static-route']).toMatchObject({
      routeType: 'route',
      response: 'complete',
      compute: 'static',
    })
    expect(manifest.routes['/empty-route']).toMatchObject({
      routeType: 'route',
      response: 'complete',
      compute: 'static',
    })

    const omittedFallback = manifest.dynamicRoutes['/omitted/[id]']
    expect(omittedFallback).not.toHaveProperty('routeType')
    expect(omittedFallback).not.toHaveProperty('response')
    expect(omittedFallback).not.toHaveProperty('compute')
  })

  it('classifies a complete static app page', async () => {
    const prerenders = await getPrerenders()
    const staticPage = prerenders.find(
      (output) => output.pathname === '/static'
    )

    expect(staticPage).toBeDefined()
    // route is the source route matcher; for a non-dynamic page it equals
    // the pathname
    expect(staticPage.route).toBe('/static')
    // no dynamic params: the prerender serves exactly one URL
    expect(staticPage.routeType).toBe('page')
    // visually complete on initial load
    expect(staticPage.response).toBe('complete')
    // no per-request compute
    expect(staticPage.compute).toBe('static')
    // full static shell on disk
    expect(staticPage.htmlSize).toBeGreaterThan(0)
  })

  it('uses 404.html for a fully static not-found', async () => {
    const prerenders = await getPrerenders()

    expect(
      prerenders.find((output) => output.pathname === '/_not-found')
    ).toBeUndefined()
    expect(await next.readFile('.next/server/pages/404.html')).toContain(
      'Not Found'
    )
  })

  it('classifies an upgradable app template as fallback', async () => {
    const prerenders = await getPrerenders()
    const template = prerenders.find(
      (output) => output.pathname === '/blog/[slug]'
    )

    expect(template).toBeDefined()
    expect(template.route).toBe('/blog/[slug]')
    // [slug] is prerenderable (generateStaticParams) and missing from this
    // prerender
    expect(template.routeType).toBe('fallback')
    // the shell contains pending UI for the params/dynamic content
    expect(template.response).toBe('initial')
    // the prerender postponed, so serving it resumes on the server
    expect(template.compute).toBe('resuming')
    expect(template.htmlSize).toBeGreaterThan(0)
  })

  it('classifies a terminal partial fallback as shell', async () => {
    const prerenders = await getPrerenders()
    const generic = prerenders.find(
      (output) => output.pathname === '/prefix/[one]/[two]'
    )
    const partial = prerenders.find(
      (output) => output.pathname === '/prefix/b/[two]'
    )

    // generic template: [one] can still be filled by generateStaticParams
    expect(generic).toBeDefined()
    expect(generic.route).toBe('/prefix/[one]/[two]')
    expect(generic.routeType).toBe('fallback')
    expect(generic.response).toBe('initial')
    expect(generic.compute).toBe('resuming')

    // partial fallback: all prerenderable params are present; [two] is a
    // dynamic param, so this is the generic UI for a class of URLs
    expect(partial).toBeDefined()
    expect(partial.route).toBe('/prefix/[one]/[two]')
    expect(partial.routeType).toBe('shell')
    expect(partial.response).toBe('initial')
    expect(partial.compute).toBe('resuming')
  })

  it('upgrades a complete static fallback to a shell after filling one param', async () => {
    const prerenders = await getPrerenders()
    const concrete = prerenders.find(
      (output) =>
        output.pathname === '/combinations/fallback-complete-static/known'
    )
    const generic = prerenders.find(
      (output) =>
        output.pathname ===
        '/combinations/fallback-complete-static/[slug]/[rest]'
    )
    const partial = prerenders.find(
      (output) =>
        output.pathname ===
        '/combinations/fallback-complete-static/known/[rest]'
    )

    // The fully resolved route is a page serving exactly one URL.
    expect(concrete).toBeDefined()
    expect(concrete.route).toBe('/combinations/fallback-complete-static/[slug]')
    expect(concrete.routeType).toBe('page')
    expect(concrete.response).toBe('complete')
    expect(concrete.compute).toBe('static')

    // [slug] can still be filled by generateStaticParams, so this is an
    // upgradable fallback for the source route.
    expect(generic).toBeDefined()
    expect(generic.route).toBe(
      '/combinations/fallback-complete-static/[slug]/[rest]'
    )
    expect(generic.routeType).toBe('fallback')
    expect(generic.response).toBe('complete')
    expect(generic.compute).toBe('static')

    // generateStaticParams filled [slug], but [rest] remains unresolved and
    // is not prerenderable. The response therefore serves a class of URLs,
    // but it can no longer be specialized by another generated param.
    expect(partial).toBeDefined()
    expect(partial.route).toBe(
      '/combinations/fallback-complete-static/[slug]/[rest]'
    )
    expect(partial.routeType).toBe('shell')
    expect(partial.response).toBe('complete')
    expect(partial.compute).toBe('static')
  })

  it('classifies client-resolving pending UI as initial without compute', async () => {
    const prerenders = await getPrerenders()
    const clientHole = prerenders.find(
      (output) => output.pathname === '/client-hole'
    )

    expect(clientHole).toBeDefined()
    // one URL, no dynamic params
    expect(clientHole.routeType).toBe('page')
    // the HTML contains a Suspense fallback that resolves on the client
    // (useSearchParams)...
    expect(clientHole.response).toBe('initial')
    // ...but serving it needs no per-request compute
    expect(clientHole.compute).toBe('static')
    expect(clientHole.htmlSize).toBeGreaterThan(0)
  })

  it.each(['/empty-shell', '/inferred-empty/known'])(
    'classifies the empty prerender for %s as dynamic',
    async (pathname) => {
      const prerenders = await getPrerenders()
      const emptyShell = prerenders.find(
        (output) => output.pathname === pathname
      )

      expect(emptyShell).toMatchObject({
        routeType: 'page',
        response: 'empty',
        compute: 'dynamic',
        htmlSize: 0,
        fallback: {
          postponedState: expect.any(String),
        },
      })
    }
  )

  it('distinguishes inferred empty shells from explicitly blocking matchers', async () => {
    const manifest = await getPrerenderManifest()
    const prerenders = await getPrerenders()
    const inferred = '/inferred-empty/[slug]'
    const blocking = '/blocking-param/[slug]'

    expect(manifest.dynamicRoutes[inferred]).toMatchObject({
      fallback: null,
      response: 'empty',
      compute: 'dynamic',
    })
    expect(
      manifest.dynamicRoutes[inferred].isExplicitlyBlocking
    ).toBeUndefined()
    expect(manifest.dynamicRoutes[blocking]).toMatchObject({
      fallback: null,
      isExplicitlyBlocking: true,
      response: 'empty',
      compute: 'blocking',
    })
    for (const [pathname, compute] of [
      [inferred, 'dynamic'],
      [blocking, 'blocking'],
    ]) {
      const output = prerenders.find((output) => output.pathname === pathname)
      expect(output).toMatchObject({ response: 'empty', compute })
      expect(output.fallback).toBeUndefined()
    }
    expect(manifest.routes['/blocking-param/known']).toMatchObject({
      response: 'complete',
      compute: 'static',
    })
  })

  it.each([
    ['static', 'blocking'],
    ['mixed', 'blocking'],
    ['not-found', 'blocking'],
    ['mixed-not-found', 'blocking'],
    ['client-only', 'blocking'],
    ['partial', 'dynamic'],
  ])(
    'classifies empty on-demand matchers from %s build-time results',
    async (name, compute) => {
      const prerenders = await getPrerenders()
      const manifest = await getPrerenderManifest()
      const pathname = `/on-miss/${name}/[slug]`

      expect(manifest.dynamicRoutes[pathname]).toMatchObject({
        response: 'empty',
        compute: 'dynamic',
        remainingPrerenderableParams: [{ paramName: 'slug' }],
        rscCompute: { resolvedPathname: compute, completedShell: compute },
      })
      for (const suffix of ['', '.rsc']) {
        const output = prerenders.find(
          (output) => output.pathname === pathname + suffix
        )
        expect(output).toMatchObject({
          route: pathname,
          response: 'empty',
          compute,
        })
      }
    }
  )

  it('preserves concrete classifications when selecting an unknown-param miss policy', async () => {
    const prerenders = await getPrerenders()
    for (const [pathname, compute] of [
      ['/on-miss/static/known', 'static'],
      ['/on-miss/mixed/static', 'static'],
      ['/on-miss/mixed/partial', 'resuming'],
      ['/on-miss/partial/first', 'resuming'],
      ['/on-miss/partial/second', 'resuming'],
    ]) {
      expect(
        prerenders.find((output) => output.pathname === pathname)
      ).toMatchObject({ routeType: 'page', compute })
    }
    expect(
      prerenders.find(
        (output) => output.pathname === '/on-miss/client-only/known'
      )
    ).toMatchObject({
      routeType: 'page',
      response: 'initial',
      compute: 'static',
    })
  })

  it('includes static not-found prerenders in the build-time results', async () => {
    const prerenders = await getPrerenders()
    const manifest = await getPrerenderManifest()
    for (const name of ['not-found', 'mixed-not-found']) {
      const pathname = `/on-miss/${name}/not-found`
      expect(manifest.routes[pathname]).toMatchObject({
        routeType: 'page',
        response: 'complete',
        compute: 'static',
      })
      for (const suffix of ['', '.rsc']) {
        expect(
          prerenders.find((output) => output.pathname === pathname + suffix)
        ).toMatchObject({ response: 'complete', compute: 'static' })
      }
    }
  })

  it('uses terminal prerender results only for matching unresolved params', async () => {
    const prerenders = await getPrerenders()
    const source = '/on-miss/shells/[category]/[item]'
    const find = (pathname: string) =>
      prerenders.find((output) => output.pathname === pathname)

    for (const category of ['first', 'second']) {
      expect(find(`/on-miss/shells/${category}/[item]`)).toMatchObject({
        route: source,
        routeType: 'shell',
        response: 'complete',
        compute: 'static',
      })
      expect(find(`/on-miss/shells/${category}/[item].rsc`)).toMatchObject({
        route: source,
        response: 'empty',
        compute: 'blocking',
        config: { allowQuery: ['nxtPitem'] },
      })
    }
    expect(find(source)).toMatchObject({
      response: 'empty',
      compute: 'blocking',
    })
    expect(find(source + '.rsc')).toMatchObject({
      response: 'empty',
      compute: 'dynamic',
      config: { allowQuery: ['nxtPcategory'] },
    })
  })

  it('waits when the cache key resolves more params than the terminal prerenders', async () => {
    const prerenders = await getPrerenders()
    const manifest = await getPrerenderManifest()
    const source = '/on-miss/complete-fallback/[category]/[item]'
    for (const pathname of [
      source,
      '/on-miss/complete-fallback/first/[item]',
      '/on-miss/complete-fallback/second/[item]',
    ]) {
      expect(
        prerenders.find((output) => output.pathname === pathname)
      ).toMatchObject({ response: 'complete', compute: 'static' })
      expect(
        prerenders.find((output) => output.pathname === pathname + '.rsc')
      ).toMatchObject({ response: 'empty', compute: 'blocking' })
      expect(manifest.dynamicRoutes[pathname].rscCompute).toEqual({
        resolvedPathname: 'blocking',
        completedShell: 'dynamic',
      })
    }
  })

  it.each([
    ['/[slug]', 'dynamic'],
    ['/s/[id]', 'blocking'],
    ['/photo/[id]', 'blocking'],
  ])(
    'compares URL params for matchers with a parallel slot: %s',
    async (suffix, compute) => {
      const source = '/on-miss/slot' + suffix
      const manifest = await getPrerenderManifest()
      const prerenders = await getPrerenders()
      expect(manifest.dynamicRoutes[source].fallbackRouteParams).toEqual(
        expect.arrayContaining([
          { paramName: 'catchAll', paramType: 'catchall' },
        ])
      )
      expect(manifest.dynamicRoutes[source].rscCompute).toEqual({
        resolvedPathname: compute,
        completedShell: 'dynamic',
      })
      for (const extension of ['', '.rsc']) {
        expect(
          prerenders.find((output) => output.pathname === source + extension)
        ).toMatchObject({ response: 'empty', compute })
      }
    }
  )

  it('classifies the intercepting route from its own static prerender', async () => {
    const prerenders = await getPrerenders()
    for (const extension of ['', '.rsc']) {
      expect(
        prerenders.find(
          (output) =>
            output.pathname === '/on-miss/slot/(.)photo/[id]' + extension
        )
      ).toMatchObject({ response: 'empty', compute: 'blocking' })
      expect(
        prerenders.find(
          (output) =>
            output.pathname === '/on-miss/slot/(.)photo/known' + extension
        )
      ).toMatchObject({ response: 'complete', compute: 'static' })
    }
  })

  it('resolves concrete URL and slot params through the adapter handler', async () => {
    const port = await findPort()
    const launcher = spawn(
      'node',
      [path.join(next.testDir, 'adapter-launcher.js')],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
        stdio: 'pipe',
      }
    )
    let output = ''
    launcher.stdout?.on('data', (chunk) => (output += chunk))
    launcher.stderr?.on('data', (chunk) => (output += chunk))
    try {
      await retry(async () => {
        expect(output).toContain('adapter launcher ready')
      })
      const source = '/on-miss/complete-fallback/[category]/[item]'
      const { previewModeId } = await next.readJSON(
        '.next/server/preview-props.json'
      )
      for (const {
        pathname,
        matchedPath,
        query,
        resolvedParam,
        marker,
        content,
        slotValue,
      } of [
        {
          pathname: source,
          matchedPath: source,
          query: 'nxtPcategory=third&nxtPitem=x',
          resolvedParam: 'x',
          marker: '#',
          content: 'Complete static content',
          slotValue: null,
        },
        {
          pathname: '/on-miss/complete-fallback/first/[item]',
          matchedPath: source,
          query: 'nxtPitem=y',
          resolvedParam: 'y',
          marker: '#',
          content: 'Complete static content',
          slotValue: null,
        },
        {
          pathname: '/on-miss/slot/[slug]',
          matchedPath: '/on-miss/slot/[slug]',
          query: 'nxtPslug=third',
          resolvedParam: 'third',
          marker: '~',
          content: 'Partial result: ',
          slotValue: 'third',
        },
        {
          pathname: '/on-miss/slot/s/[id]',
          matchedPath: '/on-miss/slot/s/[id]',
          query: 'nxtPid=other',
          resolvedParam: 'other',
          marker: '#',
          content: 'Static:',
          slotValue: 's/other',
        },
        {
          pathname: '/on-miss/slot/photo/[id]',
          matchedPath: '/on-miss/slot/photo/[id]',
          query: 'nxtPid=other',
          resolvedParam: 'other',
          marker: '#',
          content: 'Canonical photo:',
          slotValue: 'photo/other',
        },
      ]) {
        const response = await fetch(
          `http://localhost:${port}${pathname}.rsc?${query}`,
          {
            headers: {
              rsc: '1',
              'x-matched-path': matchedPath,
              'x-prerender-revalidate': previewModeId,
            },
          }
        )
        const body = await response.text()
        expect(response.status).toBe(200)
        if (marker === '#') {
          expect(response.headers.get('x-nextjs-prerender')).toBe('1')
        }
        expect(body.startsWith(marker)).toBe(true)
        expect(body).toContain('"k":' + JSON.stringify(resolvedParam))
        expect(body).toContain(content)
        if (slotValue !== null) {
          expect(body).toContain(
            '"n":"catchAll","t":"c","k":' + JSON.stringify(slotValue)
          )
          expect(body).not.toContain('Intercepted photo:')
        }
      }
    } finally {
      if (launcher.exitCode === null && launcher.signalCode === null) {
        const exited = once(launcher, 'exit')
        launcher.kill()
        await exited
      }
    }
  })

  it('includes empty terminal shells among results requiring continuation', async () => {
    const prerenders = await getPrerenders()
    const manifest = await getPrerenderManifest()
    const source = '/on-miss/empty-shells/[category]/[item]'
    for (const category of ['first', 'second']) {
      const pathname = `/on-miss/empty-shells/${category}/[item]`
      expect(manifest.dynamicRoutes[pathname].fallback).toEqual(
        expect.any(String)
      )
      for (const suffix of ['', '.rsc']) {
        expect(
          prerenders.find((output) => output.pathname === pathname + suffix)
        ).toMatchObject({ response: 'empty', compute: 'dynamic' })
      }
    }
    for (const suffix of ['', '.rsc']) {
      expect(
        prerenders.find((output) => output.pathname === source + suffix)
      ).toMatchObject({ response: 'empty', compute: 'dynamic' })
    }
  })

  it('preserves shared HTML and RSC fallbacks that keep params unresolved', async () => {
    const prerenders = await getPrerenders()
    const source = '/on-miss/nonempty/[slug]'
    expect(
      prerenders.find((output) => output.pathname === source)
    ).toMatchObject({
      response: 'initial',
      compute: 'resuming',
      config: { allowQuery: [] },
    })
    expect(
      prerenders.find((output) => output.pathname === source + '.rsc')
    ).toMatchObject({
      response: 'empty',
      compute: 'dynamic',
      config: { allowQuery: [] },
    })
    for (const suffix of ['', '.rsc']) {
      expect(
        prerenders.find(
          (output) => output.pathname === '/on-miss/nonempty/known' + suffix
        )
      ).toMatchObject({ response: 'complete', compute: 'static' })
    }
  })

  it('classifies static Route Handler bodies as complete routes', async () => {
    const prerenders = await getPrerenders()

    for (const pathname of ['/static-route', '/empty-route']) {
      const route = prerenders.find((output) => output.pathname === pathname)
      expect(route).toBeDefined()
      expect(route.routeType).toBe('route')
      expect(route.response).toBe('complete')
      expect(route.compute).toBe('static')
      expect(route).not.toHaveProperty('htmlSize')
      expect(route.fallback.filePath.endsWith(`${pathname}.body`)).toBe(true)
    }
  })

  it('classifies concrete prerenders that postponed as resuming', async () => {
    const prerenders = await getPrerenders()
    const concrete = prerenders.find(
      (output) => output.pathname === '/blog/first'
    )
    const pprShell = prerenders.find(
      (output) => output.pathname === '/ppr-shell'
    )
    const pagePostponed = prerenders.find(
      (output) => output.pathname === '/page-postponed'
    )

    // concrete prerendered path: no dynamic params remain, and the
    // pathname differs from the route matcher
    expect(concrete).toBeDefined()
    expect(concrete.route).toBe('/blog/[slug]')
    expect(concrete.pathname).not.toBe(concrete.route)
    expect(concrete.routeType).toBe('page')
    expect(concrete.response).toBe('initial')
    expect(concrete.compute).toBe('resuming')

    expect(pprShell).toBeDefined()
    expect(pprShell.routeType).toBe('page')
    expect(pprShell.response).toBe('initial')
    expect(pprShell.compute).toBe('resuming')
    expect(pprShell.htmlSize).toBeGreaterThan(0)

    // even when the whole page postpones (loading.tsx boundary), the shell
    // still contains the root layout HTML under cacheComponents, so
    // htmlSize is > 0 and the response is initial rather than empty
    expect(pagePostponed).toBeDefined()
    expect(pagePostponed.routeType).toBe('page')
    expect(pagePostponed.response).toBe('initial')
    expect(pagePostponed.compute).toBe('resuming')
    expect(pagePostponed.htmlSize).toBeGreaterThan(0)
  })

  it('classifies Pages Router prerenders', async () => {
    const prerenders = await getPrerenders()
    const gsp = prerenders.find((output) => output.pathname === '/gsp')
    const blockingTemplate = prerenders.find(
      (output) => output.pathname === '/blocking/[id]'
    )
    const staticFallback = prerenders.find(
      (output) => output.pathname === '/static-fallback/[id]'
    )
    const omittedTemplate = prerenders.find(
      (output) => output.pathname === '/omitted/[id]'
    )

    expect(gsp).toBeDefined()
    expect(gsp.route).toBe('/gsp')
    expect(gsp.config.renderingMode).toBeUndefined()
    expect(gsp.routeType).toBe('page')
    expect(gsp.response).toBe('complete')
    expect(gsp.compute).toBe('static')
    expect(gsp).not.toHaveProperty('htmlSize')

    expect(blockingTemplate).toBeDefined()
    expect(blockingTemplate.route).toBe('/blocking/[id]')
    expect(blockingTemplate.config.renderingMode).toBeUndefined()
    expect(blockingTemplate.routeType).toBe('page')
    expect(blockingTemplate.response).toBe('empty')
    expect(blockingTemplate.compute).toBe('blocking')
    expect(blockingTemplate).not.toHaveProperty('htmlSize')

    expect(staticFallback).toBeDefined()
    expect(staticFallback.route).toBe('/static-fallback/[id]')
    expect(staticFallback.config.renderingMode).toBeUndefined()
    expect(staticFallback.routeType).toBe('fallback')
    expect(staticFallback.response).toBe('initial')
    expect(staticFallback.compute).toBe('static')
    expect(staticFallback).not.toHaveProperty('htmlSize')

    // fallback: false templates exist in the adapter graph, but are never
    // served for an unmatched URL and therefore have no classification.
    expect(omittedTemplate).toBeDefined()
    expect(omittedTemplate.route).toBe('/omitted/[id]')
    expect(omittedTemplate.config.renderingMode).toBeUndefined()
    expect(omittedTemplate).not.toHaveProperty('routeType')
    expect(omittedTemplate).not.toHaveProperty('response')
    expect(omittedTemplate).not.toHaveProperty('compute')
    expect(omittedTemplate).not.toHaveProperty('htmlSize')
  })

  it.each([
    {
      pathname: '/static',
      routeType: 'page',
      response: 'complete',
      compute: 'static',
    },
    {
      pathname: '/client-hole',
      routeType: 'page',
      response: 'complete',
      compute: 'static',
    },
    {
      pathname: '/empty-shell',
      routeType: 'page',
      response: 'empty',
      compute: 'dynamic',
    },
    {
      pathname: '/blog/first',
      routeType: 'page',
      response: 'empty',
      compute: 'dynamic',
    },
    {
      pathname: '/blog/[slug]',
      routeType: 'fallback',
      response: 'empty',
      compute: 'dynamic',
    },
    {
      pathname: '/blocking-param/[slug]',
      routeType: 'page',
      response: 'empty',
      compute: 'blocking',
    },
    {
      pathname: '/inferred-empty/[slug]',
      routeType: 'page',
      response: 'empty',
      compute: 'dynamic',
    },
    {
      pathname: '/inferred-empty/known',
      routeType: 'page',
      response: 'empty',
      compute: 'dynamic',
    },
    {
      pathname: '/ensure-static/[slug]',
      routeType: 'page',
      response: 'empty',
      compute: 'static',
    },
    {
      pathname: '/ensure-static/known',
      routeType: 'page',
      response: 'complete',
      compute: 'static',
    },
    {
      pathname: '/blocking-param/known',
      routeType: 'page',
      response: 'complete',
      compute: 'static',
    },
    {
      pathname: '/combinations/shell-complete-static/[slug]',
      routeType: 'shell',
      response: 'empty',
      compute: 'blocking',
    },
  ])(
    'classifies the full-route RSC output for $pathname',
    async ({ pathname, ...classification }) => {
      const prerenders = await getPrerenders()
      const output = prerenders.find(
        (prerender) => prerender.pathname === pathname + '.rsc'
      )
      expect(output).toBeDefined()
      expect(output).toMatchObject(classification)
      expect(output).not.toHaveProperty('htmlSize')
      expect(output.fallback?.filePath !== undefined).toBe(
        classification.response === 'complete'
      )
    }
  )

  it('keeps unclassified templates and segment prefetches unclassified', async () => {
    const prerenders = await getPrerenders()
    const manifest = await getPrerenderManifest()

    const expectUnclassified = (output: any) => {
      expect(output).not.toHaveProperty('routeType')
      expect(output).not.toHaveProperty('response')
      expect(output).not.toHaveProperty('compute')
      expect(output).not.toHaveProperty('htmlSize')
    }

    const omittedData = prerenders.find(
      (output) =>
        output.pathname === manifest.dynamicRoutes['/omitted/[id]'].dataRoute
    )
    expect(omittedData).toBeDefined()
    expectUnclassified(omittedData)

    const segments = prerenders.filter((output) =>
      output.pathname.startsWith('/blog/[slug].segments/')
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(segment.route).toBe('/blog/[slug]')
      expectUnclassified(segment)
    }
  })
})
