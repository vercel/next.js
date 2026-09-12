import { nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'

describe('param-matching-unseeded-prefix', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let manifest: PrerenderManifest

  beforeAll(async () => {
    manifest = JSON.parse(await next.readFile('.next/prerender-manifest.json'))
  })

  it('keeps both params dynamic when neither has examples or an explicit policy', () => {
    expect(
      manifest.dynamicRoutes['/inferred/[top]/[bottom]']
        .remainingPrerenderableParams
    ).toBeUndefined()
  })

  it.each(['blocking', 'fallback'])(
    'infers a prerenderable prefix before bottom: %s without build-time examples',
    (mode) => {
      const matcher = manifest.dynamicRoutes[`/${mode}/[top]/[bottom]`]

      // There is no generateStaticParams in these routes. An explicit
      // prerenderable bottom requires top to be prerenderable too: an inferred
      // dynamic top would make the effective matching order incoherent.
      expect(
        matcher.remainingPrerenderableParams?.map(({ paramName }) => paramName)
      ).toEqual(['top', 'bottom'])
    }
  )

  it('infers fallback for an unconfigured prefix with a non-empty shell', () => {
    expect(
      typeof manifest.dynamicRoutes['/fallback/[top]/[bottom]'].fallback
    ).toBe('string')
  })

  it('keeps an inferred prefix blocking before an explicitly blocking param', () => {
    expect(
      manifest.dynamicRoutes['/blocking/[top]/[bottom]'].fallback
    ).toBeNull()
  })

  it('infers blocking for an empty shell without build-time examples', () => {
    const matcher = manifest.dynamicRoutes['/empty/[top]/[bottom]']
    expect(matcher.fallback).toBeNull()
    expect(
      matcher.remainingPrerenderableParams?.map(({ paramName }) => paramName)
    ).toEqual(['top', 'bottom'])
  })

  it('keeps unconfigured params after the explicit policy dynamic', () => {
    const matcher =
      manifest.dynamicRoutes['/dynamic-tail/[top]/[bottom]/[tail]']
    expect(
      matcher.remainingPrerenderableParams?.map(({ paramName }) => paramName)
    ).toEqual(['top', 'bottom'])
    expect(
      matcher.fallbackRouteParams?.map(({ paramName }) => paramName)
    ).toEqual(['top', 'bottom', 'tail'])
  })

  it('infers blocking for top while retaining the explicit bottom fallback', () => {
    expect(
      manifest.dynamicRoutes['/seeded-empty/[top]/[bottom]'].fallback
    ).toBeNull()
    expect(
      typeof manifest.dynamicRoutes['/seeded-empty/t1/[bottom]'].fallback
    ).toBe('string')
  })
})
