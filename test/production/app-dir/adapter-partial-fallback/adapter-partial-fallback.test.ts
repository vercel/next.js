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
      // `slug` is a fallback root param. For segments whose structural
      // vary set is tracked (e.g. the __PAGE__ segment and any layout),
      // the placeholder substitution model means the segment bytes don't
      // depend on `slug`, so the cache key must not include it. For
      // /_full and /_head, structural vary is `null` (full route) and we
      // fall back to the page-level allowQuery, which still includes
      // `nxtPslug`.
      const expected =
        output.pathname.includes('/_full.') ||
        output.pathname.includes('/_head.')
          ? ['nxtPslug']
          : []
      expect(output.config.allowQuery).toEqual(expected)
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
    // Same fallback-param exclusion as `with-gsp`: structural-tracked
    // segments drop `one` (a fallback root param); /_full and /_head fall
    // back to the page-level allowQuery.
    for (const output of genericPrefixOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBe(true)
      const expected =
        output.pathname.includes('/_full.') ||
        output.pathname.includes('/_head.')
          ? ['nxtPone']
          : []
      expect(output.config.allowQuery).toEqual(expected)
    }

    expect(generatedPrefixPrerender.config.partialFallback).toBeUndefined()
    expect(generatedPrefixPrerender.config.allowQuery).toEqual([])

    expect(genericDashedPrerender.config.partialFallback).toBe(true)
    expect(genericDashedPrerender.config.allowQuery).toEqual(['nxtPmy-slug'])

    expect(generatedDashedPrerender.config.partialFallback).toBeUndefined()
    expect(generatedDashedPrerender.config.allowQuery).toEqual([])
  })

  it('narrows segment allowQuery by structural and fallback exclusion', async () => {
    // /structural-narrowing/[outer]/[inner] has no GSP. Its page-level
    // allowQuery contains both dynamic params, so any non-empty segment
    // allowQuery would have to come from inheriting that set wholesale.
    // The narrowing here is two-step:
    //   1. Structural: only count params reachable via this segment's
    //      `params` prop (the synthetic _tree segment reads none).
    //   2. Fallback: drop params whose values are baked-in placeholders
    //      at render time (substituted per request), since the segment
    //      bytes don't actually depend on them.
    // For this fully-dynamic shell both `outer` and `inner` are fallback
    // route params, so even the __PAGE__ segment ends up empty.
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const route = '/structural-narrowing/[outer]/[inner]'
    const segmentsDirPrefix = `${route}.segments/`

    const pagePrerender = outputs.prerenders.find((o) => o.pathname === route)
    if (!pagePrerender) {
      throw new Error(`No prerender for ${route}`)
    }
    // Page-level allowQuery still carries both params: the page response
    // varies on them at the cache layer (one fallback shell per param
    // value combination, with placeholders substituted at request time).
    expect(pagePrerender.config.allowQuery).toEqual(
      expect.arrayContaining(['nxtPouter', 'nxtPinner'])
    )

    const segments = outputs.prerenders.filter((o) =>
      o.pathname.startsWith(segmentsDirPrefix)
    )

    // The synthetic _tree segment never receives `params`. Without
    // structural narrowing it would inherit the page-level set; the
    // empty assertion is load-bearing for the structural pass.
    const treeSegment = segments.find((o) => o.pathname.includes('/_tree.'))
    if (!treeSegment) {
      throw new Error(`No tree segment for ${route}`)
    }
    expect(treeSegment.config.allowQuery).toEqual([])

    // The __PAGE__ segment structurally reaches both params, so without
    // fallback exclusion it would inherit ['nxtPouter','nxtPinner'].
    // The empty assertion is load-bearing for the fallback pass: it
    // proves both placeholder params are dropped from the cache key.
    const pageSegment = segments.find((o) => o.pathname.includes('__PAGE__'))
    if (!pageSegment) {
      throw new Error(`No page segment for ${route}`)
    }
    expect(pageSegment.config.allowQuery).toEqual([])
  })
})
