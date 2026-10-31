import { nextTestSetup } from 'e2e-utils'
import { randomUUID } from 'crypto'
import escapeStringRegexp from 'escape-string-regexp'
import stripAnsi from 'strip-ansi'
import { join } from 'path'
import { assertNoConsoleErrors, retry, waitForNoRedbox } from 'next-test-utils'

describe('app-root-param-getters - cache - at runtime', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-runtime'),
  })

  async function readSWR(key: string, roots: string) {
    const $ = await next.render$(`/${roots}/swr?key=${key}`)
    expect(`${$('#lang').text()}/${$('#country-code').text()}`).toBe(roots)
    const value = $('#value').text()
    expect(value).toBeDateString()
    return value
  }

  async function revalidateSWR(key: string, roots: string) {
    const response = await next.fetch(`/${roots}/swr/revalidate?key=${key}`, {
      method: 'POST',
    })
    expect(response.status).toBe(204)
  }

  it('should revalidate only the tagged root params', async () => {
    const key = randomUUID()
    const enValue = await readSWR(key, 'en/us')
    const frValue = await readSWR(key, 'fr/ca')
    expect(enValue).not.toBe(frValue)

    await revalidateSWR(key, 'en/us')
    // TODO: Restore this assertion on deploy when tag revalidation supports
    // stale-while-revalidate for remote cache entries.
    if (!isNextDeploy) {
      expect(await readSWR(key, 'en/us')).toBe(enValue)
    }
    expect(await readSWR(key, 'fr/ca')).toBe(frValue)
    await retry(async () => {
      expect(new Date(await readSWR(key, 'en/us'))).toBeAfter(new Date(enValue))
    })
    expect(await readSWR(key, 'fr/ca')).toBe(frValue)
  })

  // @force-gate !deploy
  it('should deduplicate background revalidation separately for each root pair', async () => {
    const key = randomUUID()
    const roots = ['en/us', 'fr/ca']
    const values = await Promise.all(roots.map((root) => readSWR(key, root)))
    await Promise.all(roots.map((root) => revalidateSWR(key, root)))
    const outputIndex = next.cliOutput.length
    const getOutput = () =>
      stripAnsi(next.cliOutput.slice(outputIndex))
        .split('\n')
        .filter((line) => !line.includes(' Cache '))
        .join('\n')

    // Complete the triggering responses before more requests read the stale
    // entries.
    expect(await Promise.all(roots.map((root) => readSWR(key, root)))).toEqual(
      values
    )
    expect(await Promise.all(roots.map((root) => readSWR(key, root)))).toEqual(
      values
    )

    await retry(() => {
      const output = getOutput()
      for (const root of roots) {
        expect(output).toIncludeRepeated(
          escapeStringRegexp(`swr start ${key} ${root}`),
          1
        )
        expect(output).toIncludeRepeated(
          escapeStringRegexp(`swr finish ${key} ${root}`),
          1
        )
      }
    })
    for (const [index, root] of roots.entries()) {
      await retry(async () => {
        expect(new Date(await readSWR(key, root))).toBeAfter(
          new Date(values[index])
        )
      })
      expect(getOutput()).toIncludeRepeated(
        escapeStringRegexp(`swr start ${key} ${root}`),
        1
      )
      expect(getOutput()).toIncludeRepeated(
        escapeStringRegexp(`swr finish ${key} ${root}`),
        1
      )
    }
  })

  if (isNextDev) {
    it('should allow using root params within a "use cache" - dev', async () => {
      const browser = await next.browser('/en/us/use-cache')
      await waitForNoRedbox(browser)
      expect(await browser.elementById('param').text()).toBe('en us')
    })

    it('should error when using root params within `unstable_cache` - dev', async () => {
      const browser = await next.browser('/en/us/unstable_cache')
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /[lang]/[countryCode]/unstable_cache used \`import('next/root-params').lang()\` inside \`unstable_cache\`. This is not supported. Use \`"use cache"\` instead.",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/[lang]/[countryCode]/unstable_cache/page.tsx (33:28) @ uncachedGetParams
       > 33 |   return { lang: await lang(), countryCode: await countryCode() }
            |                            ^",
         "stack": [
           "uncachedGetParams app/[lang]/[countryCode]/unstable_cache/page.tsx (33:28)",
           "Runtime app/[lang]/[countryCode]/unstable_cache/page.tsx (17:22)",
         ],
       }
      `)
    })

    it('should error when using root params in "use cache" nested inside unstable_cache - dev', async () => {
      const browser = await next.browser('/en/us/nested-in-unstable_cache')
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /[lang]/[countryCode]/nested-in-unstable_cache used \`import('next/root-params').lang()\` inside \`"use cache"\` nested within \`unstable_cache\`. Root params are not available in this context.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/[lang]/[countryCode]/nested-in-unstable_cache/page.tsx (29:28) @ getCachedParams
       > 29 |   return { lang: await lang(), countryCode: await countryCode() }
            |                            ^",
         "stack": [
           "getCachedParams app/[lang]/[countryCode]/nested-in-unstable_cache/page.tsx (29:28)",
         ],
       }
      `)
    })
  } else {
    it('should allow using root params within a "use cache" - start', async () => {
      const browser = await next.browser('/en/us/use-cache')
      expect(await browser.elementById('param').text()).toBe('en us')
    })

    it('should create separate cache entries for different root params', async () => {
      const browser = await next.browser('/en/us/use-cache')
      expect(await browser.elementById('param').text()).toBe('en us')
      const enRandom = await browser.elementById('random').text()

      await browser.loadPage(next.url + '/fr/ca/use-cache')
      expect(await browser.elementById('param').text()).toBe('fr ca')
      const frRandom = await browser.elementById('random').text()

      // Different root params must produce different cache entries.
      expect(enRandom).not.toBe(frRandom)

      // Each entry must be individually cached (same random on revisit).
      await browser.loadPage(next.url + '/en/us/use-cache')
      expect(await browser.elementById('random').text()).toBe(enRandom)

      await browser.loadPage(next.url + '/fr/ca/use-cache')
      expect(await browser.elementById('random').text()).toBe(frRandom)
    })

    it('should resume with the same cached data that was prerendered', async () => {
      const browser = await next.browser('/en/us/use-cache-resume', {
        pushErrorAsConsoleLog: true,
      })

      expect(await browser.elementById('random').text()).toBeTruthy()

      await retry(async () => {
        expect(await browser.elementById('dynamic').text()).toBe('dynamic')
      })

      // If the Resume Data Cache lookup missed during the resume (e.g. due to a
      // key mismatch caused by root params), the "use cache" function would
      // re-execute and produce a different random value than the one in the
      // prerendered shell, causing a hydration error.
      await assertNoConsoleErrors(browser)
    })

    it('should handle conditional root param reads based on arguments', async () => {
      const browser = await next.browser('/en/us/maybe-reads-root-param')

      expect(await browser.elementById('with-lang-value').text()).toBe('en')
      expect(await browser.elementById('without-lang-value').text()).toBe(
        'null'
      )
      const enWithRandom = await browser.elementById('with-lang-random').text()
      const enWithoutRandom = await browser
        .elementById('without-lang-random')
        .text()

      await browser.loadPage(next.url + '/fr/ca/maybe-reads-root-param')

      expect(await browser.elementById('with-lang-value').text()).toBe('fr')
      expect(await browser.elementById('without-lang-value').text()).toBe(
        'null'
      )
      const frWithRandom = await browser.elementById('with-lang-random').text()
      const frWithoutRandom = await browser
        .elementById('without-lang-random')
        .text()

      // Different root params produce different cache entries.
      expect(frWithRandom).not.toBe(enWithRandom)

      // The without-lang call doesn't read lang, but after
      // knownRootParamsByFunctionId grows, the key includes lang too, so
      // different root params still produce different entries.
      expect(frWithoutRandom).not.toBe(enWithoutRandom)

      // Revisit to confirm cache hits.
      await browser.loadPage(next.url + '/en/us/maybe-reads-root-param')
      expect(await browser.elementById('with-lang-random').text()).toBe(
        enWithRandom
      )
      expect(await browser.elementById('without-lang-random').text()).toBe(
        enWithoutRandom
      )

      await browser.loadPage(next.url + '/fr/ca/maybe-reads-root-param')
      expect(await browser.elementById('with-lang-random').text()).toBe(
        frWithRandom
      )
      expect(await browser.elementById('without-lang-random').text()).toBe(
        frWithoutRandom
      )
    })

    it('should handle root param reads introduced after revalidation', async () => {
      const browser = await next.browser('/en/us/conditional-on-another-cache')

      // Reset the flag in case a previous test attempt left it enabled.
      if ((await browser.elementById('lang-value').text()) !== 'null') {
        await browser.elementById('disable-flag').click()
        await retry(async () => {
          expect(await browser.elementById('lang-value').text()).toBe('null')
        })
      }

      // Before the flag is enabled, lang is not read on any route.
      await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
      expect(await browser.elementById('lang-value').text()).toBe('null')

      // Enable the flag and revalidate (staying on the fr/ca page).
      await browser.elementById('enable-flag').click()

      await retry(async () => {
        expect(await browser.elementById('lang-value').text()).toBe('fr')
      })

      // Wait for the cache to settle by verifying the random value is stable
      // across two consecutive loads.
      let frRandom: string = ''
      await retry(async () => {
        await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
        frRandom = await browser.elementById('random').text()
        await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
        expect(await browser.elementById('random').text()).toBe(frRandom)
      })

      // Different root params must now produce different entries because lang
      // is being read.
      await browser.loadPage(next.url + '/en/us/conditional-on-another-cache')

      expect(await browser.elementById('lang-value').text()).toBe('en')
      const enRandom = await browser.elementById('random').text()
      expect(enRandom).not.toBe(frRandom)

      // Revisit fr/ca to confirm cache hit.
      await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
      expect(await browser.elementById('random').text()).toBe(frRandom)
    })

    it('should handle root param reads conditional on another root param value', async () => {
      // Visit en/us first — reads both lang and countryCode.
      const browser = await next.browser('/en/us/conditional-on-root-param')

      expect(await browser.elementById('lang-value').text()).toBe('en')
      expect(await browser.elementById('country-code-value').text()).toBe('us')
      const enUsRandom = await browser.elementById('random').text()

      // Visit en/gb — also reads both. Must produce a different entry because
      // countryCode differs.
      await browser.loadPage(next.url + '/en/gb/conditional-on-root-param')

      expect(await browser.elementById('lang-value').text()).toBe('en')
      expect(await browser.elementById('country-code-value').text()).toBe('gb')
      const enGbRandom = await browser.elementById('random').text()
      expect(enGbRandom).not.toBe(enUsRandom)

      // Visit fr/ca — only reads lang (not countryCode), but
      // knownRootParamsByFunctionId already includes countryCode from the en
      // visits. The key is more specific than needed, which is safe.
      await browser.loadPage(next.url + '/fr/ca/conditional-on-root-param')

      expect(await browser.elementById('lang-value').text()).toBe('fr')
      expect(await browser.elementById('country-code-value').text()).toBe(
        'null'
      )
      const frCaRandom = await browser.elementById('random').text()
      expect(frCaRandom).not.toBe(enUsRandom)
      expect(frCaRandom).not.toBe(enGbRandom)

      // Revisit all three to confirm cache hits.
      await browser.loadPage(next.url + '/en/us/conditional-on-root-param')
      expect(await browser.elementById('random').text()).toBe(enUsRandom)

      await browser.loadPage(next.url + '/en/gb/conditional-on-root-param')
      expect(await browser.elementById('random').text()).toBe(enGbRandom)

      await browser.loadPage(next.url + '/fr/ca/conditional-on-root-param')
      expect(await browser.elementById('random').text()).toBe(frCaRandom)
    })

    if (!isNextDeploy) {
      it('should error when using root params within `unstable_cache` - start', async () => {
        await next.render$('/en/us/unstable_cache')
        expect(next.cliOutput).toInclude(
          "Error: Route /[lang]/[countryCode]/unstable_cache used `import('next/root-params').lang()` inside `unstable_cache`"
        )
      })

      it('should error when using root params in "use cache" nested inside unstable_cache - start', async () => {
        await next.render$('/en/us/nested-in-unstable_cache')
        expect(next.cliOutput).toInclude(
          'Error: Route /[lang]/[countryCode]/nested-in-unstable_cache used `import(\'next/root-params\').lang()` inside `"use cache"` nested within `unstable_cache`. Root params are not available in this context.'
        )
      })
    }
  }
})

describe('app-root-param-getters - private cache', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-private'),
  })

  if (isNextDev) {
    it('should allow using root params within a "use cache: private" - dev', async () => {
      const browser = await next.browser('/en/us/use-cache-private')

      await waitForNoRedbox(browser)
      expect(await browser.elementById('param').text()).toBe('en us')

      // A different set of root params must produce a separate entry. Since
      // private caches are persisted in dev, this confirms the entry is keyed
      // by root params and isn't reused for a different `[lang]/[locale]`.
      await browser.loadPage(next.url + '/es/es/use-cache-private')
      await waitForNoRedbox(browser)
      expect(await browser.elementById('param').text()).toBe('es es')
    })
  } else {
    it('should allow using root params within a "use cache: private" - start', async () => {
      const browser = await next.browser('/en/us/use-cache-private')
      expect(await browser.elementById('param').text()).toBe('en us')
    })
  }
})

describe('app-root-param-getters - cache - at build', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-build'),
  })

  if (isNextDev) {
    // we omit these tests in dev because they are duplicates semantically to
    // the runtime fixture tested above
    it('noop in dev', () => {})
  } else {
    it('should allow using root params within a "use cache" at build time', async () => {
      const browser = await next.browser('/en/us/use-cache')
      expect(await browser.elementById('param').text()).toBe('en us')

      await browser.loadPage(next.url + '/es/es/use-cache')
      expect(await browser.elementById('param').text()).toBe('es es')
    })
  }
})

describe('app-root-param-getters - cache dedup with root params', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-dedup'),
  })

  beforeAll(async () => {
    if (isNextDev) {
      // Compile the page before the concurrent test requests. Without an `id`,
      // the page skips `readCachedValue()`, so its root parameter dependencies
      // remain unknown.
      await next.render('/ca/en/write-failure')
    }
  })

  // The control route and cache handler share process-local test state.
  // @force-gate !deploy
  it('persists a joining root value after the shared producer cache write fails', async () => {
    const id = `write-failure-${randomUUID()}`
    const control = (action: string) =>
      next.fetch(`/write-failure-control?id=${id}`, {
        method: 'POST',
        body: action,
      })
    const readState = () =>
      next.fetch('/write-failure-control').then(
        (response) =>
          response.json() as Promise<{
            requestedLanguages: string[]
            generatedLanguages: string[]
            failedWriteLanguages: string[]
            writtenLanguages: string[]
          }>
      )
    // Keep the English cached call pending until the French request starts.
    // Both calls initially use the key without root parameters because the
    // wrapper has not collected the English call's `lang` dependency yet.
    await control('hold-fill')
    const english = next.render$(`/ca/en/write-failure?id=${id}`)
    let french: ReturnType<typeof next.render$> | undefined
    try {
      await retry(async () => {
        expect((await readState()).generatedLanguages).toEqual(['en'])
      })
      french = next.render$(`/ca/fr/write-failure?id=${id}`)
      await retry(async () => {
        const state = await readState()
        expect(state.requestedLanguages).toEqual(['en', 'fr'])
        expect(state.generatedLanguages).toEqual(['en'])
      })
      // The English `set()` calls reject. The French request must still retry
      // the lookup with its own `lang` value and return French data.
      await control('release-fill')
      const [englishPage, frenchPage] = await Promise.all([english, french])
      expect(englishPage('#value').text()).toStartWith('en:')
      const frenchValue = frenchPage('#value').text()
      expect(frenchValue).toStartWith('fr:')
      await retry(async () => {
        const state = await readState()
        expect(state.failedWriteLanguages).toContain('en')
        expect(state.writtenLanguages).toContain('fr')
      })
      // The next request must reuse the stored French entry. Another execution
      // of `readCachedValue()` would generate a new UUID.
      expect(
        (await next.render$(`/ca/fr/write-failure?id=${id}`))('#value').text()
      ).toBe(frenchValue)
    } finally {
      await control('release-fill')
      await Promise.allSettled([english, french])
    }
  })

  it('should key a joining outer cache by the root params read by its inner cache', async () => {
    const english = await next.render$('/ca/en/nested?prime=1')
    expect(english('#first').text()).toBe('en')
    expect(english('#second').text()).toBe('en')

    const french = await next.render$('/ca/fr/nested')
    expect(french('#first')).toHaveLength(0)
    expect(french('#second').text()).toBe('fr')
  })

  // Cross-request deduplication requires a shared server process. Deployed
  // requests can reach different function instances.
  // @force-gate !deploy
  it('should dedupe same root params and isolate different root params', async () => {
    // Three concurrent requests: ca/en, ca/fr, ca/fr.
    const [$en, $fr1, $fr2] = await Promise.all([
      next.render$('/ca/en'),
      next.render$('/ca/fr'),
      next.render$('/ca/fr'),
    ])

    const randomEn = $en('#random').text()
    const randomFr1 = $fr1('#random').text()
    const randomFr2 = $fr2('#random').text()

    expect(randomEn).toBeTruthy()
    expect(randomFr1).toBeTruthy()

    // ca/en and ca/fr should have different results (isolation).
    expect(randomEn).not.toBe(randomFr1)

    // Both ca/fr requests should have the same result (deduped).
    expect(randomFr1).toBe(randomFr2)
  })

  // These cross-request cache checks require a shared server process. Deployed
  // requests can reach different function instances.
  // @force-gate !deploy
  it('should dedupe same root params and isolate different root params for private caches', async () => {
    // Three concurrent requests: ca/en, ca/fr, ca/fr.
    const [$en, $fr1, $fr2] = await Promise.all([
      next.render$('/ca/en/use-cache-private'),
      next.render$('/ca/fr/use-cache-private'),
      next.render$('/ca/fr/use-cache-private'),
    ])

    const randomEn = $en('#random').text()
    const randomFr1 = $fr1('#random').text()
    const randomFr2 = $fr2('#random').text()

    expect(randomEn).toBeTruthy()
    expect(randomFr1).toBeTruthy()

    // Different root params produce different entries, in dev and production.
    expect(randomEn).not.toBe(randomFr1)

    if (isNextDev) {
      // In dev, private caches are persisted and participate in cross-request
      // deduplication keyed by root params, so the two ca/fr requests join one
      // in-flight invocation and share a single fill.
      expect(randomFr1).toBe(randomFr2)
    } else {
      // In production, private caches are not persisted and are never deduped
      // across requests, so each ca/fr request generates its own value.
      expect(randomFr1).not.toBe(randomFr2)
    }
  })
})

for (const { held, failure } of [
  { held: 'redirect', failure: '' },
  { held: 'value', failure: '' },
  { held: 'redirect', failure: 'value' },
  { held: 'value', failure: 'redirect' },
]) {
  // Handler barriers require both requests to reach the same server process.
  // @force-gate start
  describe(`root cache writes: hold ${held}, fail ${failure}`, () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'use-cache-dedup'),
      env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
    })

    it('currently shares the producer lookup while waiting for both root-param writes', async () => {
      const id = `write-order-${randomUUID()}`
      const control = (action: string) =>
        next.fetch(
          `/write-failure-control?id=${id}&held=${held}&failure=${failure}`,
          { method: 'POST', body: action }
        )
      const readState = () =>
        next.fetch('/write-failure-control').then(
          (response) =>
            response.json() as Promise<{
              requestedLanguages: string[]
              generatedLanguages: string[]
              startedWrites: string[]
              failedWriteLanguages: string[]
              writtenLanguages: string[]
              lookupKeys: string[]
            }>
        )
      await control('hold-fill')
      await control(`hold-${held}-write`)
      const english = next.render$(`/ca/en/write-failure?id=${id}`)
      let french: ReturnType<typeof next.render$> | undefined
      try {
        await retry(async () => {
          expect((await readState()).generatedLanguages).toEqual(['en'])
        })
        french = next.render$(`/ca/fr/write-failure?id=${id}`)
        await retry(async () => {
          const state = await readState()
          expect(state.requestedLanguages).toEqual(['en', 'fr'])
          expect(state.lookupKeys).toHaveLength(1)
          expect(
            next.cliOutput
              .split('\n')
              .some(
                (line) =>
                  line.includes('joining pending cross-request invocation') &&
                  line.includes(id)
              )
          ).toBe(true)
        })
        await control('release-fill')
        await retry(async () => {
          const state = await readState()
          expect(state.startedWrites).toEqual(
            expect.arrayContaining(['redirect', 'value'])
          )
          if (failure !== '') {
            expect(state.failedWriteLanguages).toEqual(['en'])
          } else {
            expect(state.writtenLanguages).toContain('en')
          }
        })
        // The other write already settled. Root-key retries still have to wait
        // for the held write, including when that settled write rejected.
        const pendingState = await readState()
        expect(pendingState.generatedLanguages).toEqual(['en'])
        expect(pendingState.lookupKeys).toHaveLength(1)
        await control('release-write')
        const [englishPage, frenchPage] = await Promise.all([english, french])
        expect(englishPage('#value').text()).toStartWith('en:')
        const frenchValue = frenchPage('#value').text()
        expect(frenchValue).toStartWith('fr:')
        await retry(async () => {
          expect((await readState()).writtenLanguages).toContain('fr')
        })
        expect(
          (await next.render$(`/ca/fr/write-failure?id=${id}`))('#value').text()
        ).toBe(frenchValue)
      } finally {
        await control('release-fill')
        await control('release-write')
        await Promise.allSettled([english, french])
      }
    })
  })
}

// The handler and both generation controls require a shared server process.
// @force-gate start
describe('root cache lookup across two pending generations', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-dedup'),
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
  })

  it('currently joins both generations without reading the redirected handler key', async () => {
    const id = `lookup-history-${randomUUID()}`
    const pathname = `/ca/en/write-failure?id=${id}`
    const control = (action: string) =>
      next.fetch(`/write-failure-control?id=${id}`, {
        method: 'POST',
        body: action,
      })
    const readState = () =>
      next.fetch('/write-failure-control').then(
        (response) =>
          response.json() as Promise<{
            generatedLanguages: string[]
            requestedLanguages: string[]
            initialLookupCount: number
            specificLookupCount: number
            writtenLanguages: string[]
          }>
      )
    await control('hold-fill')
    await control('hold-lookup-history')
    const initialProducer = next.render$(pathname)
    let consumer: ReturnType<typeof next.render$> | undefined
    let specificProducer: ReturnType<typeof next.render$> | undefined
    try {
      await retry(async () => {
        expect((await readState()).generatedLanguages).toEqual(['en'])
      })
      consumer = next.render$(`${pathname}&outer=1`)
      await retry(async () => {
        expect((await readState()).requestedLanguages).toEqual(['en', 'en'])
        expect(
          next.cliOutput
            .split('\n')
            .some(
              (line) =>
                line.includes('joining pending cross-request invocation') &&
                line.includes(id)
            )
        ).toBe(true)
      })
      // Read root params become known while the initial value write is held.
      // The new request starts generation under the root-specific key.
      await control('release-fill')
      await retry(async () => {
        expect((await readState()).writtenLanguages).toContain('en')
      })
      specificProducer = next.render$(pathname)
      await retry(async () => {
        expect((await readState()).generatedLanguages).toEqual(['en', 'en'])
      })
      const pendingState = await readState()
      expect(pendingState.initialLookupCount).toBe(1)
      expect(pendingState.specificLookupCount).toBe(1)
      await control('release-write')
      await retry(() => {
        expect(
          next.cliOutput
            .split('\n')
            .some(
              (line) =>
                line.includes('joining pending cross-request invocation') &&
                line.includes(id) &&
                line.includes('"lang","en"')
            )
        ).toBe(true)
      })
      await control('release-second-write')
      const [, specificPage, page] = await Promise.all([
        initialProducer,
        specificProducer,
        consumer,
      ])
      expect(page('#value').text()).toBe(specificPage('#value').text())
      expect((await readState()).generatedLanguages).toEqual(['en', 'en'])
      expect(page('#value').text()).toStartWith('en:')
    } finally {
      await control('release-fill')
      await control('release-initial-lookup')
      await control('release-specific-lookup')
      await control('release-second-write')
      await control('release-write')
      await Promise.allSettled([initialProducer, consumer, specificProducer])
    }
  })
})
