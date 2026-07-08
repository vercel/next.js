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

  it('emits classification metadata for a concrete static app page', async () => {
    const prerenders = await getPrerenders()
    const staticPage = prerenders.find(
      (output) => output.pathname === '/static'
    )

    expect(staticPage).toBeDefined()
    // route is the source route matcher; for a non-dynamic page it equals
    // the pathname
    expect(staticPage.route).toBe('/static')
    // cacheComponents => PARTIALLY_STATIC; fully prerendered => no resume
    // needed, so false, not undefined
    expect(staticPage.resuming).toBe(false)
    // full static shell on disk; htmlSize > 0 && resuming === false derives
    // "complete"
    expect(staticPage.htmlSize).toBeGreaterThan(0)
  })

  it('emits classification metadata for an app fallback template', async () => {
    const prerenders = await getPrerenders()
    const template = prerenders.find(
      (output) => output.pathname === '/blog/[slug]'
    )

    expect(template).toBeDefined()
    // the fallback template entry is the prerender whose pathname equals
    // its route matcher
    expect(template.route).toBe('/blog/[slug]')
    // the fallback shell postponed on params/dynamic content, so serving
    // it resumes on the server
    expect(template.resuming).toBe(true)
    // the fallback shell exists on disk
    expect(template.htmlSize).toBeGreaterThan(0)
  })

  it('marks concrete prerenders of a dynamic route with the route matcher', async () => {
    const prerenders = await getPrerenders()
    const concrete = prerenders.find(
      (output) => output.pathname === '/blog/first'
    )

    expect(concrete).toBeDefined()
    // concrete prerendered path: pathname differs from the route matcher
    expect(concrete.route).toBe('/blog/[slug]')
    expect(concrete.pathname).not.toBe(concrete.route)
  })

  it('emits resuming for app pages that postponed during build', async () => {
    const prerenders = await getPrerenders()
    const pprShell = prerenders.find(
      (output) => output.pathname === '/ppr-shell'
    )
    const pagePostponed = prerenders.find(
      (output) => output.pathname === '/page-postponed'
    )

    expect(pprShell).toBeDefined()
    expect(pprShell.resuming).toBe(true)
    expect(pprShell.route).toBe('/ppr-shell')
    expect(pprShell.htmlSize).toBeGreaterThan(0)

    // even when the whole page postpones (loading.tsx boundary), the shell
    // still contains the root layout HTML under cacheComponents, so
    // htmlSize is > 0 rather than 0
    expect(pagePostponed).toBeDefined()
    expect(pagePostponed.resuming).toBe(true)
    expect(pagePostponed.htmlSize).toBeGreaterThan(0)
  })

  it('emits classification metadata for pages router prerenders', async () => {
    const prerenders = await getPrerenders()
    const gsp = prerenders.find((output) => output.pathname === '/gsp')
    const blockingTemplate = prerenders.find(
      (output) => output.pathname === '/blocking/[id]'
    )
    const omittedTemplate = prerenders.find(
      (output) => output.pathname === '/omitted/[id]'
    )

    // concrete pages-router prerender: PPR signals don't apply
    expect(gsp).toBeDefined()
    expect(gsp.route).toBe('/gsp')
    expect(gsp.resuming).toBeUndefined()
    expect(gsp.htmlSize).toBeUndefined()

    // fallback: 'blocking' template — pathname === route marks it as the
    // template entry; no PPR signals
    expect(blockingTemplate).toBeDefined()
    expect(blockingTemplate.route).toBe('/blocking/[id]')
    expect(blockingTemplate.resuming).toBeUndefined()
    expect(blockingTemplate.htmlSize).toBeUndefined()

    // fallback: false (omitted) template
    expect(omittedTemplate).toBeDefined()
    expect(omittedTemplate.route).toBe('/omitted/[id]')
    expect(omittedTemplate.resuming).toBeUndefined()
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
    expect(staticRsc.resuming).toBe(false)
    expect(staticRsc.htmlSize).toBeUndefined()

    // RSC output of a fallback template (spread from initialOutput)
    const templateRsc = prerenders.find(
      (output) => output.pathname === '/blog/[slug].rsc'
    )
    expect(templateRsc).toBeDefined()
    expect(templateRsc.route).toBe('/blog/[slug]')
    expect(templateRsc.resuming).toBe(true)
    expect(templateRsc.htmlSize).toBeUndefined()

    // segment prerenders (built as fresh literals in handleAppMeta) must
    // carry the same route-level fields as their HTML output
    const segments = prerenders.filter((output) =>
      output.pathname.startsWith('/blog/[slug].segments/')
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(segment.route).toBe('/blog/[slug]')
      expect(segment.resuming).toBe(true)
      expect(segment.htmlSize).toBeUndefined()
    }
  })
})
