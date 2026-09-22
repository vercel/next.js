import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'
import { PrefetchHint } from 'next/src/shared/lib/app-router-types'

describe('use-cache-fallback-root-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The build seeds generic shells with the RDC from a concrete prerender.
  // Root-dependent entries must become holes when that root is unknown.
  // @force-gate !dev && !deploy
  it('omits root-dependent entries from the RDC used to build generic shells', async () => {
    const $ = load(await next.readFile('.next/server/app/[lang].html'))
    expect($('#cached-pending').length).toBe(1)
    expect($('#cached-lang').length).toBe(0)
    expect($('#independent').text()).toBe('shared content')

    const $nested = load(
      await next.readFile('.next/server/app/[lang]/nested.html')
    )
    expect($nested('#nested-pending').length).toBe(1)
    expect($nested('#nested-lang').length).toBe(0)
    expect($nested('#independent').text()).toBe('shared content')

    const $boundary = load(
      await next.readFile('.next/server/app/[lang]/boundary.html')
    )
    expect($boundary('#outer-pending').length).toBe(1)
    expect(
      $boundary('#cache-prefix, #inner-pending, #direct-lang').length
    ).toBe(0)
  })

  // @force-gate !dev && !deploy
  it('keeps cached root content in shells whose root is known', async () => {
    for (const language of ['en', 'es']) {
      const $ = load(
        await next.readFile(`.next/server/app/${language}/items/[slug].html`)
      )
      expect($('#cached-lang').text()).toBe(language.toUpperCase())
      expect($('#cached-pending').length).toBe(0)
      expect($('#slug-pending').length).toBe(1)
    }
  })

  // These are per-shell build measurements, not the route-level manifest:
  // a concrete prerender can supply that manifest's hints before the generic
  // shell is rendered. Inspect the generic shell to exercise RDC pruning.
  // @force-gate !dev && !deploy
  it('preserves static-prefetch hints when only fallback roots are missing', async () => {
    for (const pathname of ['[lang]', '[lang]/nested', '[lang]/boundary']) {
      const meta = JSON.parse(
        await next.readFile(`.next/server/app/${pathname}.meta`)
      )
      expect(
        (meta.prefetchHints?.hints ?? 0) &
          PrefetchHint.ShouldAttemptStaticPrefetch
      ).toBe(PrefetchHint.ShouldAttemptStaticPrefetch)
    }
  })

  // @force-gate !dev && !deploy
  it('does not mistake searchParams in a cached page for a fallback root read', async () => {
    const meta = JSON.parse(
      await next.readFile('.next/server/app/[lang]/search.meta')
    )
    expect(
      (meta.prefetchHints?.hints ?? 0) &
        PrefetchHint.ShouldAttemptStaticPrefetch
    ).toBe(0)
  })

  it('resolves cached and uncached roots on ordinary requests', async () => {
    await Promise.all(
      ['en', 'fr', 'de'].map(async (language) => {
        const $ = await next.render$(`/${language}`)
        expect($('#cached-lang').text()).toBe(language.toUpperCase())
        expect($('#direct-lang').text()).toBe(language)
        expect($('#independent').text()).toBe('shared content')

        const $nested = await next.render$(`/${language}/nested`)
        expect($nested('#nested-lang').text()).toBe(language.toUpperCase())
        expect($nested('#independent').text()).toBe('shared content')

        const $boundary = await next.render$(`/${language}/boundary`)
        expect($boundary('#direct-lang').text()).toBe(language)
      })
    )
  })
})
