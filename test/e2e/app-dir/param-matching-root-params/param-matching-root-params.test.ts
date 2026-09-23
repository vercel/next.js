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

  // Dev renders requests dynamically rather than serving and regenerating
  // fallback shells. This exercises ordinary production revalidation.
  // @force-gate !dev
  it('keeps unknown roots out of a fallback shell regenerated after invalidation', async () => {
    const $before = await next.render$('/en/nested')
    const originalVersion = $before('#shell-version').text()
    expect(originalVersion).not.toBe('')

    const response = await next.fetch('/revalidate', { method: 'POST' })
    expect(response.status).toBe(204)

    // A novel language selects the generic shell. Expiring its cached data
    // forces a fresh fill, rather than serving the shell produced at build time.
    const $ = await next.render$('/it/nested')
    const regeneratedVersion = $('#shell-version').text()
    expect(regeneratedVersion).not.toBe('')
    expect(regeneratedVersion).not.toBe(originalVersion)
    expect($('#shell-version').closest('[hidden]').length).toBe(0)
    expect($('#nested-lang').text()).toBe('nested:IT')
    expect($('#direct-lang').text()).toBe('it')
    expect($('#nested-pending').length).toBe(1)
    expect($('#outer-pending').length).toBe(1)
    expect($('#nested-lang').closest('[hidden]').length).toBe(1)
    expect($('#cache-prefix').closest('[hidden]').length).toBe(1)

    // The regenerated shell must remain reusable for a different root.
    const $other = await next.render$('/nl/nested')
    expect($other('#shell-version').text()).toBe(regeneratedVersion)
    expect($other('#nested-lang').text()).toBe('nested:NL')
    expect($other('#direct-lang').text()).toBe('nl')
  })

  // Inspect the real build's adapter output locally. The behavioral tests above
  // also run in deploy mode, where these build artifacts are not available.
  // @force-gate start
  it('emits a servable root fallback with the exact query keys routing forwards', async () => {
    const contract = await next.readJSON('query-contract.json')
    const route = contract.routes.find(({ source }) => source === '/[lang]')
    expect(route).toBeDefined()
    const forwardedKeys = Array.from(
      new URL(route.destination, 'https://example.test').searchParams.keys()
    )
    expect(forwardedKeys).toEqual(['nxtPlang'])

    const output = contract.prerenders.find(
      ({ pathname }) => pathname === '/[lang]'
    )
    expect(output).toMatchObject({
      hasFallback: true,
      allowQuery: forwardedKeys,
    })

    const dataOutput = contract.prerenders.find(
      ({ pathname }) => pathname === '/[lang].rsc'
    )
    expect(dataOutput).toMatchObject({ allowQuery: forwardedKeys })

    const segmentOutputs = contract.prerenders.filter(({ pathname }) =>
      pathname.startsWith('/[lang].segments/')
    )
    expect(segmentOutputs.length).toBeGreaterThan(0)
    for (const segmentOutput of segmentOutputs) {
      expect(segmentOutput.allowQuery).toEqual(forwardedKeys)
    }
  })
})
