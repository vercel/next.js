import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-partial-fallback-disabled', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not emit partial fallback metadata when partialPrefetching is disabled', async () => {
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

    expect(withGspPrerender).toBeDefined()
    expect(withGspRouteTreePrerender).toBeDefined()
    expect(withGspOtherSegmentPrerenders.length).toBeGreaterThan(0)

    // Without `partialPrefetching` enabled, the route that would otherwise
    // qualify for a partial fallback shell must not emit the partialFallback
    // config, and its fallback shell collapses to the shared shell (empty
    // allowQuery).
    expect(withGspPrerender.config.partialFallback).toBeUndefined()
    expect(withGspPrerender.config.allowQuery).toEqual([])
    expect(withGspRouteTreePrerender.config.partialFallback).toBeUndefined()
    for (const output of withGspOtherSegmentPrerenders) {
      expect(output.config.partialFallback).toBeUndefined()
    }
  })
})
