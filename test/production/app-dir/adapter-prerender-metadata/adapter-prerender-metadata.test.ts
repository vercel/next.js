import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type AdapterBuildContext = Parameters<NextAdapter['onBuildComplete']>[0]

type Classification = {
  routeType: 'route' | 'page' | 'shell' | 'fallback'
  response: 'complete' | 'initial' | 'empty'
  compute: 'static' | 'resuming' | 'blocking'
}

const validClassifications: Classification[] = [
  { routeType: 'route', response: 'complete', compute: 'static' },
  { routeType: 'page', response: 'complete', compute: 'static' },
  { routeType: 'page', response: 'initial', compute: 'static' },
  { routeType: 'page', response: 'initial', compute: 'resuming' },
  { routeType: 'page', response: 'empty', compute: 'blocking' },
  { routeType: 'shell', response: 'complete', compute: 'static' },
  { routeType: 'shell', response: 'initial', compute: 'static' },
  { routeType: 'shell', response: 'initial', compute: 'resuming' },
  { routeType: 'shell', response: 'empty', compute: 'blocking' },
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
        pathname: '/empty-shell',
        manifestSection: 'routes',
        routeType: 'page',
        response: 'empty',
        compute: 'blocking',
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
        pathname: '/combinations/shell-empty-blocking/[slug]',
        manifestSection: 'dynamicRoutes',
        routeType: 'shell',
        response: 'empty',
        compute: 'blocking',
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
      compute: 'blocking',
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

  it('classifies an empty Cache Components shell as blocking', async () => {
    const prerenders = await getPrerenders()
    const emptyShell = prerenders.find(
      (output) => output.pathname === '/empty-shell'
    )

    expect(emptyShell).toBeDefined()
    expect(emptyShell.routeType).toBe('page')
    expect(emptyShell.response).toBe('empty')
    expect(emptyShell.compute).toBe('blocking')
    expect(emptyShell.htmlSize).toBe(0)
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

  it('keeps classification on canonical outputs only', async () => {
    const prerenders = await getPrerenders()

    const expectUnclassified = (output: any) => {
      expect(output).not.toHaveProperty('routeType')
      expect(output).not.toHaveProperty('response')
      expect(output).not.toHaveProperty('compute')
      expect(output).not.toHaveProperty('htmlSize')
    }

    const staticRsc = prerenders.find(
      (output) => output.pathname === '/static.rsc'
    )
    expect(staticRsc).toBeDefined()
    expect(staticRsc.route).toBe('/static')
    expectUnclassified(staticRsc)

    const templateRsc = prerenders.find(
      (output) => output.pathname === '/blog/[slug].rsc'
    )
    expect(templateRsc).toBeDefined()
    expect(templateRsc.route).toBe('/blog/[slug]')
    expectUnclassified(templateRsc)

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
