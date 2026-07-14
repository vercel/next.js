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

  it('classifies a complete static app page as page', async () => {
    const prerenders = await getPrerenders()
    const staticPage = prerenders.find(
      (output) => output.pathname === '/static'
    )

    expect(staticPage).toBeDefined()
    // route is the source route matcher; for a non-dynamic page it equals
    // the pathname
    expect(staticPage.route).toBe('/static')
    // complete HTML, no pending UI
    expect(staticPage.kind).toBe('page')
    // cacheComponents => PARTIALLY_STATIC; fully prerendered => no resume
    // needed, so false, not undefined
    expect(staticPage.postponed).toBe(false)
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
    // [slug] has generateStaticParams, so the shell can still be
    // prerendered into something more specific
    expect(template.kind).toBe('fallback')
    // the fallback shell postponed on params/dynamic content
    expect(template.postponed).toBe(true)
    // the fallback shell exists on disk
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
    expect(generic.kind).toBe('fallback')

    // partial fallback: [two] has no generateStaticParams, so this is the
    // most specific prerender possible for that path family
    expect(partial).toBeDefined()
    expect(partial.route).toBe('/prefix/[one]/[two]')
    expect(partial.kind).toBe('shell')
  })

  it('classifies client-resolving pending UI as shell without postponing', async () => {
    const prerenders = await getPrerenders()
    const clientHole = prerenders.find(
      (output) => output.pathname === '/client-hole'
    )

    expect(clientHole).toBeDefined()
    // the HTML contains a Suspense fallback that resolves on the client
    // (useSearchParams), so it's a shell...
    expect(clientHole.kind).toBe('shell')
    // ...but serving it needs no per-request compute
    expect(clientHole.postponed).toBe(false)
    expect(clientHole.htmlSize).toBeGreaterThan(0)
  })

  it('classifies concrete prerenders that postponed as shell', async () => {
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

    // concrete prerendered path: pathname differs from the route matcher
    expect(concrete).toBeDefined()
    expect(concrete.route).toBe('/blog/[slug]')
    expect(concrete.pathname).not.toBe(concrete.route)
    // it postponed on uncached IO, so its pending UI resolves on the server
    expect(concrete.kind).toBe('shell')
    expect(concrete.postponed).toBe(true)

    expect(pprShell).toBeDefined()
    expect(pprShell.kind).toBe('shell')
    expect(pprShell.postponed).toBe(true)
    expect(pprShell.htmlSize).toBeGreaterThan(0)

    // even when the whole page postpones (loading.tsx boundary), the shell
    // still contains the root layout HTML under cacheComponents, so
    // htmlSize is > 0 rather than 0
    expect(pagePostponed).toBeDefined()
    expect(pagePostponed.kind).toBe('shell')
    expect(pagePostponed.postponed).toBe(true)
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

    // concrete pages-router prerender: complete HTML; PPR signals don't
    // apply
    expect(gsp).toBeDefined()
    expect(gsp.route).toBe('/gsp')
    expect(gsp.kind).toBe('page')
    expect(gsp.postponed).toBeUndefined()
    expect(gsp.htmlSize).toBeUndefined()

    // fallback: 'blocking' template — no shell is prerenderable
    expect(blockingTemplate).toBeDefined()
    expect(blockingTemplate.route).toBe('/blocking/[id]')
    expect(blockingTemplate.kind).toBe('blocking')
    expect(blockingTemplate.postponed).toBeUndefined()
    expect(blockingTemplate.htmlSize).toBeUndefined()

    // fallback: false (omitted) template — no shell is prerenderable
    expect(omittedTemplate).toBeDefined()
    expect(omittedTemplate.route).toBe('/omitted/[id]')
    expect(omittedTemplate.kind).toBe('blocking')
    expect(omittedTemplate.postponed).toBeUndefined()
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
    expect(staticRsc.kind).toBe('page')
    expect(staticRsc.postponed).toBe(false)
    expect(staticRsc.htmlSize).toBeUndefined()

    // RSC output of a fallback template (spread from initialOutput)
    const templateRsc = prerenders.find(
      (output) => output.pathname === '/blog/[slug].rsc'
    )
    expect(templateRsc).toBeDefined()
    expect(templateRsc.route).toBe('/blog/[slug]')
    expect(templateRsc.kind).toBe('fallback')
    expect(templateRsc.postponed).toBe(true)
    expect(templateRsc.htmlSize).toBeUndefined()

    // segment prerenders (built as fresh literals in handleAppMeta) must
    // carry the same route-level fields as their HTML output
    const segments = prerenders.filter((output) =>
      output.pathname.startsWith('/blog/[slug].segments/')
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(segment.route).toBe('/blog/[slug]')
      expect(segment.kind).toBe('fallback')
      expect(segment.postponed).toBe(true)
      expect(segment.htmlSize).toBeUndefined()
    }
  })
})
