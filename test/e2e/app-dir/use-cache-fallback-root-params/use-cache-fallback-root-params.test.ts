import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

describe('use-cache-fallback-root-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { __NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING: '1' },
  })

  // Reading the build output exercises the populated RDC, independently of
  // the debug requests below, which generate fresh shells at runtime.
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

  // The shell-debugging switch is a local-only way to exercise fresh cache
  // fills with unknown roots. Ordinary root misses still block without the
  // paramMatching API.
  // @force-gate !deploy
  it('suspends fresh nested root reads without cancelling independent caches', async () => {
    const [$, $concrete] = await Promise.all([
      next.render$('/fr/nested?__nextppronly=fallback'),
      next.render$('/de/nested'),
    ])
    expect($('#nested-pending').length).toBe(1)
    expect($('#nested-lang').length).toBe(0)
    expect($('#cached-pending').length).toBe(1)
    expect($('#cached-lang').length).toBe(0)
    expect($('#independent').text()).toBe('shared content')
    expect($concrete('#nested-lang').text()).toBe('DE')
    expect($concrete('#independent').text()).toBe('shared content')
  })

  // @force-gate !deploy
  it('suspends fresh cached root reads just like uncached reads', async () => {
    const $ = await next.render$('/fr?__nextppronly=fallback')
    expect($('#direct-pending').length).toBe(1)
    expect($('#cached-pending').length).toBe(1)
    expect($('#direct-lang, #cached-lang').length).toBe(0)
    expect($('#independent').text()).toBe('shared content')
  })

  // @force-gate !deploy
  it('suspends the whole cache even when it contains a Suspense boundary', async () => {
    const $ = await next.render$('/fr/boundary?__nextppronly=fallback')
    expect($('#outer-pending').length).toBe(1)
    expect($('#cache-prefix, #inner-pending, #direct-lang').length).toBe(0)
    const $concrete = await next.render$('/fr/boundary')
    expect($concrete('#direct-lang').text()).toBe('fr')
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

  it('resolves concrete roots correctly after generic shells have been rendered', async () => {
    await Promise.all(
      ['en', 'fr', 'de'].map(async (language) => {
        const $ = await next.render$(`/${language}`)
        expect($('#cached-lang').text()).toBe(language.toUpperCase())
        expect($('#direct-lang').text()).toBe(language)
        expect($('#independent').text()).toBe('shared content')

        const $nested = await next.render$(`/${language}/nested`)
        expect($nested('#nested-lang').text()).toBe(language.toUpperCase())
        expect($nested('#independent').text()).toBe('shared content')
      })
    )
  })
})
