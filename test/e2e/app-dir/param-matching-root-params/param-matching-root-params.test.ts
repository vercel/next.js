import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('param-matching-root-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CAPTURE_QUERY_CONTRACT: isNextStart ? '1' : '' },
  })

  it('resolves both cached and uncached reads for a build-time example', async () => {
    const $ = await next.render$('/en')
    expect($('#direct-lang').text()).toBe('en')
    expect($('#cached-lang').text()).toBe('locale:EN')
  })

  it.each(['fr', 'de'])(
    'resolves cached computations for novel root %s',
    async (language) => {
      const $ = await next.render$(`/${language}`)
      expect($('#direct-lang').text()).toBe(language)
      expect($('#cached-lang').text()).toBe(`locale:${language.toUpperCase()}`)
    }
  )

  it('does not retain placeholder-derived content or another root in the cache', async () => {
    for (const language of ['it', 'nl', 'it', 'en']) {
      const $ = await next.render$(`/${language}`)
      expect($('#direct-lang').text()).toBe(language)
      expect($('#cached-lang').text()).toBe(`locale:${language.toUpperCase()}`)
    }
  })

  it('agrees after navigation across roots and after refresh', async () => {
    const browser = await next.browser('/en')
    await browser.elementByCss('a[href="/fr"]').click()
    expect(
      await browser.elementByCss('#direct-lang[data-language="fr"]').text()
    ).toBe('fr')
    expect(await browser.elementById('cached-lang').text()).toBe('locale:FR')
    await browser.refresh()
    expect(await browser.elementById('cached-lang').text()).toBe('locale:FR')
    await browser.elementByCss('a[href="/de"]').click()
    expect(
      await browser.elementByCss('#direct-lang[data-language="de"]').text()
    ).toBe('de')
    expect(await browser.elementById('cached-lang').text()).toBe('locale:DE')
  })

  it('propagates unresolved root reads through nested cache fills', async () => {
    for (const language of ['en', 'fr', 'de', 'fr']) {
      const $ = await next.render$(`/${language}/nested`)
      expect($('#nested-lang').text()).toBe(`nested:${language.toUpperCase()}`)
    }
  })

  // @force-gate start
  it('only varies deployed root fallbacks on query keys that routing forwards', async () => {
    const contract = await next.readJSON('query-contract.json')
    const route = contract.routes.find(({ source }) => source === '/[lang]')
    expect(route).toBeDefined()
    const forwarded = new URL(route.destination, 'https://example.test')
      .searchParams
    const output = contract.prerenders.find(
      ({ pathname }) => pathname === '/[lang]'
    )
    expect(output).toBeDefined()
    for (const key of output.allowQuery) {
      expect({ key, forwarded: forwarded.has(key) }).toEqual({
        key,
        forwarded: true,
      })
    }
  })
})
