import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-partial-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit partial fallback metadata when infra can upgrade the shell', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const withGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/with-gsp/[slug]'
    )
    const withGspRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/with-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/with-gsp/[slug].segments/') &&
        output.pathname !== '/with-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withoutGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/without-gsp/[slug]'
    )
    const withoutGspRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/without-gsp/[slug].segments/_tree.segment.rsc'
    )
    const withoutGspOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/without-gsp/[slug].segments/') &&
        output.pathname !== '/without-gsp/[slug].segments/_tree.segment.rsc'
    )
    const genericPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/prefix/[one]/[two]'
    )
    const genericPrefixRouteTreePrerender = outputs.prerenders.find(
      (output) =>
        output.pathname === '/prefix/[one]/[two].segments/_tree.segment.rsc'
    )
    const genericPrefixOtherSegmentPrerenders = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/prefix/[one]/[two].segments/') &&
        output.pathname !== '/prefix/[one]/[two].segments/_tree.segment.rsc'
    )
    const generatedPrefixPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/prefix/b/[two]'
    )
    const genericDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/dashed/[my-slug]/[two]'
    )
    const generatedDashedPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/dashed/b/[two]'
    )

    expect(withGspPrerender).toBeDefined()
    expect(withGspRouteTreePrerender).toBeDefined()
    expect(withGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(withoutGspPrerender).toBeDefined()
    expect(withoutGspRouteTreePrerender).toBeDefined()
    expect(withoutGspOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(genericPrefixPrerender).toBeDefined()
    expect(genericPrefixRouteTreePrerender).toBeDefined()
    expect(genericPrefixOtherSegmentPrerenders.length).toBeGreaterThan(0)
    expect(generatedPrefixPrerender).toBeDefined()
    expect(genericDashedPrerender).toBeDefined()
    expect(generatedDashedPrerender).toBeDefined()

    expect(withGspPrerender.config.partialFallback).toBe(true)
    expect(withGspPrerender.config.allowQuery).toEqual(['nxtPslug'])
    // The /_tree segment never reads any param via `params`, so its
    // structural vary is empty regardless of the page's allowQuery.
    expect(withGspRouteTreePrerender.config.partialFallback).toBe(true)
    expect(withGspRouteTreePrerender.config.allowQuery).toEqual([])
    for (const output of withGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPslug'])
    }

    expect(withoutGspPrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspPrerender.config.allowQuery).toEqual([])
    expect(withoutGspRouteTreePrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspRouteTreePrerender.config.allowQuery).toEqual([])
    for (const output of withoutGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBeUndefined()
      expect(output.config.allowQuery).toEqual([])
    }

    expect(genericPrefixPrerender.config.partialFallback).toBe(true)
    expect(genericPrefixPrerender.config.allowQuery).toEqual(['nxtPone'])
    expect(genericPrefixRouteTreePrerender.config.partialFallback).toBe(true)
    expect(genericPrefixRouteTreePrerender.config.allowQuery).toEqual([])
    for (const output of genericPrefixOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      expect(output.config.allowQuery).toEqual(['nxtPone'])
    }

    expect(generatedPrefixPrerender.config.partialFallback).toBeUndefined()
    expect(generatedPrefixPrerender.config.allowQuery).toEqual([])

    expect(genericDashedPrerender.config.partialFallback).toBe(true)
    expect(genericDashedPrerender.config.allowQuery).toEqual(['nxtPmy-slug'])

    expect(generatedDashedPrerender.config.partialFallback).toBeUndefined()
    expect(generatedDashedPrerender.config.allowQuery).toEqual([])
  })

  it('omits params from a segment.allowQuery when the segment cannot structurally reach them', async () => {
    // /structural-narrowing/[outer]/[inner] has no GSP and no
    // fallbackRootParams, so its page-level allowQuery contains both
    // dynamic params. That's what makes this route useful as a witness:
    // each segment's allowQuery starts from the same multi-param set,
    // so the per-segment narrowing is the only thing that can drop
    // entries.
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const route = '/structural-narrowing/[outer]/[inner]'
    const segmentsDirPrefix = `${route}.segments/`

    const pagePrerender = outputs.prerenders.find((o) => o.pathname === route)
    if (!pagePrerender) {
      throw new Error(`No prerender for ${route}`)
    }
    expect(pagePrerender.config.allowQuery).toEqual(
      expect.arrayContaining(['nxtPouter', 'nxtPinner'])
    )

    const segments = outputs.prerenders.filter((o) =>
      o.pathname.startsWith(segmentsDirPrefix)
    )

    // The synthetic _tree segment never receives `params`, so its
    // allowQuery must be empty even though the page-level set has two
    // entries. Without structural narrowing this would inherit
    // nxtPouter and nxtPinner, so the negative checks are load-bearing.
    const treeSegment = segments.find((o) => o.pathname.includes('/_tree.'))
    if (!treeSegment) {
      throw new Error(`No tree segment for ${route}`)
    }
    expect(treeSegment.config.allowQuery).toEqual([])

    // The __PAGE__ segment can reach both params, so narrowing must keep
    // both. We match by substring rather than the full segment path so
    // the test isn't coupled to the segment-encoding scheme.
    const pageSegment = segments.find((o) => o.pathname.includes('__PAGE__'))
    if (!pageSegment) {
      throw new Error(`No page segment for ${route}`)
    }
    expect(pageSegment.config.allowQuery).toEqual(
      expect.arrayContaining(['nxtPouter', 'nxtPinner'])
    )
  })
})
