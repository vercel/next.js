import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type AdapterBuildContext = Parameters<NextAdapter['onBuildComplete']>[0]

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
    expect(staticPage.ui).toBe('complete')
    // no per-request compute
    expect(staticPage.compute).toBe('static')
    // full static shell on disk
    expect(staticPage.htmlSize).toBeGreaterThan(0)
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
    expect(template.ui).toBe('partial')
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
    expect(generic.ui).toBe('partial')
    expect(generic.compute).toBe('resuming')

    // partial fallback: all prerenderable params are present; [two] is a
    // dynamic param, so this is the generic UI for a class of URLs
    expect(partial).toBeDefined()
    expect(partial.route).toBe('/prefix/[one]/[two]')
    expect(partial.routeType).toBe('shell')
    expect(partial.ui).toBe('partial')
    expect(partial.compute).toBe('resuming')
  })

  it('classifies client-resolving pending UI as partial without compute', async () => {
    const prerenders = await getPrerenders()
    const clientHole = prerenders.find(
      (output) => output.pathname === '/client-hole'
    )

    expect(clientHole).toBeDefined()
    // one URL, no dynamic params
    expect(clientHole.routeType).toBe('page')
    // the HTML contains a Suspense fallback that resolves on the client
    // (useSearchParams)...
    expect(clientHole.ui).toBe('partial')
    // ...but serving it needs no per-request compute
    expect(clientHole.compute).toBe('static')
    expect(clientHole.htmlSize).toBeGreaterThan(0)
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
    expect(concrete.ui).toBe('partial')
    expect(concrete.compute).toBe('resuming')

    expect(pprShell).toBeDefined()
    expect(pprShell.routeType).toBe('page')
    expect(pprShell.ui).toBe('partial')
    expect(pprShell.compute).toBe('resuming')
    expect(pprShell.htmlSize).toBeGreaterThan(0)

    // even when the whole page postpones (loading.tsx boundary), the shell
    // still contains the root layout HTML under cacheComponents, so
    // htmlSize is > 0 and the UI is partial rather than empty
    expect(pagePostponed).toBeDefined()
    expect(pagePostponed.routeType).toBe('page')
    expect(pagePostponed.ui).toBe('partial')
    expect(pagePostponed.compute).toBe('resuming')
    expect(pagePostponed.htmlSize).toBeGreaterThan(0)
  })

  it('classifies pages router prerenders', async () => {
    const prerenders = await getPrerenders()
    const gsp = prerenders.find((output) => output.pathname === '/gsp')
    const blockingTemplate = prerenders.find(
      (output) => output.pathname === '/blocking/[id]'
    )
    const omittedTemplate = prerenders.find(
      (output) => output.pathname === '/omitted/[id]'
    )

    // concrete pages-router prerender: complete static HTML
    expect(gsp).toBeDefined()
    expect(gsp.route).toBe('/gsp')
    expect(gsp.routeType).toBe('page')
    expect(gsp.ui).toBe('complete')
    expect(gsp.compute).toBe('static')
    expect(gsp.htmlSize).toBeUndefined()

    // fallback: 'blocking' template — [id] is prerenderable via
    // getStaticPaths, but no shell was produced: the server renders
    // before any UI is ready
    expect(blockingTemplate).toBeDefined()
    expect(blockingTemplate.route).toBe('/blocking/[id]')
    expect(blockingTemplate.routeType).toBe('fallback')
    expect(blockingTemplate.ui).toBe('empty')
    expect(blockingTemplate.compute).toBe('blocking')
    expect(blockingTemplate.htmlSize).toBeUndefined()

    // fallback: false (omitted) template — no shell, and unmatched paths
    // 404 instead of rendering, so compute does not apply
    // (parentFallbackMode `false` marks the entry as not served)
    expect(omittedTemplate).toBeDefined()
    expect(omittedTemplate.route).toBe('/omitted/[id]')
    expect(omittedTemplate.routeType).toBe('fallback')
    expect(omittedTemplate.ui).toBe('empty')
    expect(omittedTemplate.compute).toBeUndefined()
    expect(omittedTemplate.htmlSize).toBeUndefined()
  })

  it('mirrors route-level fields on secondary outputs and keeps htmlSize HTML-only', async () => {
    const prerenders = await getPrerenders()

    // RSC data output of a concrete app page (spread from initialOutput)
    const staticRsc = prerenders.find(
      (output) => output.pathname === '/static.rsc'
    )
    expect(staticRsc).toBeDefined()
    expect(staticRsc.route).toBe('/static')
    expect(staticRsc.routeType).toBe('page')
    expect(staticRsc.ui).toBe('complete')
    expect(staticRsc.compute).toBe('static')
    expect(staticRsc.htmlSize).toBeUndefined()

    // RSC output of a fallback template (spread from initialOutput)
    const templateRsc = prerenders.find(
      (output) => output.pathname === '/blog/[slug].rsc'
    )
    expect(templateRsc).toBeDefined()
    expect(templateRsc.route).toBe('/blog/[slug]')
    expect(templateRsc.routeType).toBe('fallback')
    expect(templateRsc.ui).toBe('partial')
    expect(templateRsc.compute).toBe('resuming')
    expect(templateRsc.htmlSize).toBeUndefined()

    // segment prerenders (built as fresh literals in handleAppMeta) must
    // carry the same route-level fields as their HTML output
    const segments = prerenders.filter((output) =>
      output.pathname.startsWith('/blog/[slug].segments/')
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(segment.route).toBe('/blog/[slug]')
      expect(segment.routeType).toBe('fallback')
      expect(segment.ui).toBe('partial')
      expect(segment.compute).toBe('resuming')
      expect(segment.htmlSize).toBeUndefined()
    }
  })
})
