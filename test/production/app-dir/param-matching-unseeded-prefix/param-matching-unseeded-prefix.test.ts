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

      // There is no generateStaticParams anywhere in this fixture. An explicit
      // prerenderable bottom requires top to be prerenderable too: an inferred
      // dynamic top would make the effective matching order incoherent.
      expect(
        matcher.remainingPrerenderableParams?.map(({ paramName }) => paramName)
      ).toEqual(['top', 'bottom'])
    }
  )
})
