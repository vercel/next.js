import { nextTestSetup } from 'e2e-utils'

// The shell-debugging switch is local-only, not a deployed request API.
// @force-gate !deploy
describe('use-cache-fallback-root-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { __NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING: '1' },
  })

  it('defers cached root reads just like uncached root reads in a generic shell', async () => {
    const $ = await next.render$('/fr?__nextppronly=fallback')
    expect($('h1').text()).toBe('Language-independent shell')
    expect($('#direct-pending').length).toBe(1)
    expect($('#cached-pending').length).toBe(1)
    expect($('#direct-lang, #cached-lang').length).toBe(0)
  })

  it('defers the outer cache when a nested cache reads an unresolved root', async () => {
    const $ = await next.render$('/fr/nested?__nextppronly=fallback')
    expect($('#nested-pending').length).toBe(1)
    expect($('#nested-lang').length).toBe(0)
  })

  it('does not reuse generic root reads for concrete requests', async () => {
    const [$en, $fr, $de] = await Promise.all(
      ['en', 'fr', 'de'].map((language) => next.render$(`/${language}`))
    )
    for (const [$, language] of [
      [$en, 'en'],
      [$fr, 'fr'],
      [$de, 'de'],
    ] as const) {
      expect($('#cached-lang').text()).toBe(`locale:${language.toUpperCase()}`)
      expect($('#direct-lang').text()).toBe(language)
    }
    for (const language of ['fr', 'de']) {
      const $ = await next.render$(`/${language}/nested`)
      expect($('#nested-lang').text()).toBe(`nested:${language.toUpperCase()}`)
    }
  })
})
