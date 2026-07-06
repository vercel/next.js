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
    // concrete prerender from prerenderManifest.routes
    expect(staticPage.isDynamicRoute).toBe(false)
    // fallback concept doesn't apply to concrete prerenders
    expect(staticPage.hasFallback).toBeUndefined()
    // cacheComponents => PARTIALLY_STATIC; nothing postponed => false, not undefined
    expect(staticPage.hasPostponed).toBe(false)
    // full static shell on disk
    expect(staticPage.htmlSize).toBeGreaterThan(0)
  })

  it('emits classification metadata for an app fallback template', async () => {
    const prerenders = await getPrerenders()
    const template = prerenders.find(
      (output) => output.pathname === '/blog/[slug]'
    )

    expect(template).toBeDefined()
    // template from prerenderManifest.dynamicRoutes
    expect(template.isDynamicRoute).toBe(true)
    // static fallback shell was generated (manifest fallback is a string)
    expect(template.hasFallback).toBe(true)
    // the fallback shell postponed on params/dynamic content
    expect(template.hasPostponed).toBe(true)
    // the fallback shell exists on disk
    expect(template.htmlSize).toBeGreaterThan(0)
  })

  it('emits hasPostponed for app pages that postponed during build', async () => {
    const prerenders = await getPrerenders()
    const pprShell = prerenders.find(
      (output) => output.pathname === '/ppr-shell'
    )
    const pagePostponed = prerenders.find(
      (output) => output.pathname === '/page-postponed'
    )

    expect(pprShell).toBeDefined()
    expect(pprShell.hasPostponed).toBe(true)
    expect(pprShell.isDynamicRoute).toBe(false)
    expect(pprShell.hasFallback).toBeUndefined()
    expect(pprShell.htmlSize).toBeGreaterThan(0)

    // even when the whole page postpones (loading.tsx boundary), the shell
    // still contains the root layout HTML under cacheComponents, so
    // htmlSize is > 0 rather than 0
    expect(pagePostponed).toBeDefined()
    expect(pagePostponed.hasPostponed).toBe(true)
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

    // concrete pages-router prerender: template/fallback classification
    // applies, PPR signals don't
    expect(gsp).toBeDefined()
    expect(gsp.isDynamicRoute).toBe(false)
    expect(gsp.hasFallback).toBeUndefined()
    expect(gsp.hasPostponed).toBeUndefined()
    expect(gsp.htmlSize).toBeUndefined()

    // fallback: 'blocking' template — no static fallback shell
    expect(blockingTemplate).toBeDefined()
    expect(blockingTemplate.isDynamicRoute).toBe(true)
    expect(blockingTemplate.hasFallback).toBe(false)
    expect(blockingTemplate.hasPostponed).toBeUndefined()
    expect(blockingTemplate.htmlSize).toBeUndefined()

    // fallback: false (omitted) template
    expect(omittedTemplate).toBeDefined()
    expect(omittedTemplate.isDynamicRoute).toBe(true)
    expect(omittedTemplate.hasFallback).toBe(false)
    expect(omittedTemplate.hasPostponed).toBeUndefined()
    expect(omittedTemplate.htmlSize).toBeUndefined()
  })

  it('mirrors route-level fields on secondary outputs and keeps htmlSize HTML-only', async () => {
    const prerenders = await getPrerenders()

    // RSC data output of a concrete app page (spread from initialOutput)
    const staticRsc = prerenders.find(
      (output) => output.pathname === '/static.rsc'
    )
    expect(staticRsc).toBeDefined()
    expect(staticRsc.isDynamicRoute).toBe(false)
    expect(staticRsc.hasPostponed).toBe(false)
    expect(staticRsc.hasFallback).toBeUndefined()
    expect(staticRsc.htmlSize).toBeUndefined()

    // RSC output of a fallback template (spread from initialOutput)
    const templateRsc = prerenders.find(
      (output) => output.pathname === '/blog/[slug].rsc'
    )
    expect(templateRsc).toBeDefined()
    expect(templateRsc.isDynamicRoute).toBe(true)
    expect(templateRsc.hasFallback).toBe(true)
    expect(templateRsc.hasPostponed).toBe(true)
    expect(templateRsc.htmlSize).toBeUndefined()

    // segment prerenders (built as fresh literals in handleAppMeta) must
    // carry the same route-level fields as their HTML output
    const segments = prerenders.filter((output) =>
      output.pathname.startsWith('/blog/[slug].segments/')
    )
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(segment.isDynamicRoute).toBe(true)
      expect(segment.hasFallback).toBe(true)
      expect(segment.hasPostponed).toBe(true)
      expect(segment.htmlSize).toBeUndefined()
    }
  })
})
