import { nextTestSetup } from 'e2e-utils'
import { randomUUID } from 'crypto'
import escapeStringRegexp from 'escape-string-regexp'
import stripAnsi from 'strip-ansi'
import { join } from 'path'
import { assertNoConsoleErrors, retry, waitForNoRedbox } from 'next-test-utils'
import { createCacheControl, waitForCrossRequestJoin } from './cache-control'

const englishWriteTag = 'app-root-params-getters:write-language:en'
const frenchWriteTag = 'app-root-params-getters:write-language:fr'

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
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
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
    const id = randomUUID()
    const cache = await createCacheControl(next, {
      keyIncludes: [JSON.stringify(id), JSON.stringify('inner')],
    })
    const fill = await cache.holdNextGeneration({ language: 'en' })
    const redirectWrite = await cache.rejectNextWrite({
      tag: englishWriteTag,
      entry: 'redirect',
    })
    const valueWrite = await cache.rejectNextWrite({
      tag: englishWriteTag,
      entry: 'value',
    })
    const english = next.render$(`/ca/en/write-failure?id=${id}`)
    let french: ReturnType<typeof next.render$> | undefined
    try {
      await fill.waitUntilStarted()
      french = next.render$(`/ca/fr/write-failure?id=${id}`)
      // Both requests use the key without root params until the English
      // generation completes and records its read root params.
      await waitForCrossRequestJoin(next, id)
      await fill.release()
      const [englishPage, frenchPage] = await Promise.all([english, french])
      expect(englishPage('#value').text()).toStartWith('en:')
      const frenchValue = frenchPage('#value').text()
      expect(frenchValue).toStartWith('fr:')
      await redirectWrite.waitUntilRejected()
      await valueWrite.waitUntilRejected()
      await cache.waitForWrite({ tag: frenchWriteTag }, 'completed')
      // Another generation would produce a different UUID.
      expect(
        (await next.render$(`/ca/fr/write-failure?id=${id}`))('#value').text()
      ).toBe(frenchValue)
    } finally {
      await cache.releaseAll()
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

  // Each outer entry must vary by the root param read by its inner cache. The
  // outer functions return `early` while `tail` keeps the inner stream open.
  it('should key an outer cache by root params of an inner cache with a delayed Flight tail', async () => {
    const english = await next.render$('/ca/en/flight-tail')
    expect(english('#value').text()).toBe('en')

    const french = await next.render$('/ca/fr/flight-tail')
    expect(french('#value').text()).toBe('fr')
  })

  it('should key outer caches that join an inner cache by root params with a delayed Flight tail', async () => {
    const english = await next.render$('/ca/en/flight-tail-joined')
    expect(english('#first').text()).toBe('en')
    expect(english('#second').text()).toBe('en')

    const french = await next.render$('/ca/fr/flight-tail-joined')
    expect(french('#first').text()).toBe('fr')
    expect(french('#second').text()).toBe('fr')
  })

  // Cross-request deduplication requires a shared server process, and the
  // cold-fill join window is only deterministic with prebuilt routes.
  // @force-gate start
  it('should not fork a cold root-param fill into unstable_cache', async () => {
    // The direct request becomes the leader of the cold fill, registered under
    // the coarse key because no root param reads are known yet.
    const directPromise = next.render$('/ca/en/cold-join/direct')

    // Give the leader a head start so the mixed request joins its fill instead
    // of becoming the leader itself.
    await new Promise((resolve) => setTimeout(resolve, 500))

    // unstable_cache joins under the same coarse key with rootParams undefined.
    // It must not fork the leader's root-param-specific entry.
    const mixed = await next.render$('/ca/fr/cold-join/mixed')
    const direct = await directPromise

    expect(JSON.parse(direct('#value').text())).toMatchObject({ lang: 'en' })

    // The join must fail closed: no forked value is served, and nothing is
    // persisted for later unstable_cache calls.
    expect(mixed('#value')).toHaveLength(0)
    expect(next.cliOutput).toContain(
      'Error: Route /[countryCode]/[lang]/cold-join/mixed used root params (lang) inside `"use cache"` nested within `unstable_cache`. Root params are not available in this context.'
    )

    const mixedAgain = await next.render$('/ca/fr/cold-join/mixed')
    expect(mixedAgain('#value')).toHaveLength(0)
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
  { held: 'redirect', failure: null },
  { held: 'value', failure: null },
  { held: 'redirect', failure: 'value' },
  { held: 'value', failure: 'redirect' },
] as const) {
  // Handler controls require both requests to reach the same server process.
  // @force-gate start
  describe(`root cache writes: hold ${held}, fail ${failure ?? 'neither'}`, () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'use-cache-dedup'),
      env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
    })

    it('currently shares the producer lookup while waiting for both root-param writes', async () => {
      const id = randomUUID()
      const cache = await createCacheControl(next, {
        keyIncludes: [JSON.stringify(id), JSON.stringify('inner')],
      })
      const fill = await cache.holdNextGeneration({ language: 'en' })
      const heldWrite = await cache.holdNextWrite({
        tag: englishWriteTag,
        entry: held,
      })
      const otherWrite =
        failure === null
          ? await cache.observeNextWrite({
              tag: englishWriteTag,
              entry: held === 'redirect' ? 'value' : 'redirect',
            })
          : await cache.rejectNextWrite({
              tag: englishWriteTag,
              entry: failure,
            })
      const english = next.render$(`/ca/en/write-failure?id=${id}`)
      let french: ReturnType<typeof next.render$> | undefined
      try {
        await fill.waitUntilStarted()
        french = next.render$(`/ca/fr/write-failure?id=${id}`)
        await waitForCrossRequestJoin(next, id)
        expect((await cache.read()).lookupKeys).toHaveLength(1)
        await fill.release()
        await heldWrite.waitUntilStarted()
        if (failure === null) {
          await otherWrite.waitUntilCompleted()
        } else {
          await otherWrite.waitUntilRejected()
        }
        // The other write settled. A root-key retry must wait for the held
        // write, even if the other write rejected.
        const pendingState = await cache.read()
        expect(pendingState.generatedLanguages).toEqual(['en'])
        expect(pendingState.lookupKeys).toHaveLength(1)
        await heldWrite.release()
        const [englishPage, frenchPage] = await Promise.all([english, french])
        expect(englishPage('#value').text()).toStartWith('en:')
        const frenchValue = frenchPage('#value').text()
        expect(frenchValue).toStartWith('fr:')
        await cache.waitForWrite({ tag: frenchWriteTag }, 'completed')
        expect(
          (await next.render$(`/ca/fr/write-failure?id=${id}`))('#value').text()
        ).toBe(frenchValue)
      } finally {
        await cache.releaseAll()
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
    const id = randomUUID()
    const pathname = `/ca/en/write-failure?id=${id}`
    // The enclosing cache joins two pending generations of the inner cache:
    // - The first starts before the wrapper knows the read root param names.
    // - The second uses the root-specific key while the first write is held.
    //
    // The backend retains stale entries with revalidate: 0. The wrapper must
    // regenerate those entries before it stores their data in the enclosing
    // cache.
    const cache = await createCacheControl(next, {
      keyIncludes: [JSON.stringify(id), JSON.stringify('inner')],
      backend: 'retain-stale',
      cacheLife: { stale: 300, revalidate: 0, expire: 3600 },
    })
    const fill = await cache.holdNextGeneration({ language: 'en' })
    const firstValueWrite = await cache.holdNextWrite({
      tag: englishWriteTag,
      entry: 'value',
    })
    const secondValueWrite = await cache.holdNextWrite({
      tag: englishWriteTag,
      entry: 'value',
    })
    const firstRedirectWrite = await cache.observeNextWrite({
      tag: englishWriteTag,
      entry: 'redirect',
    })
    const secondRedirectWrite = await cache.observeNextWrite({
      tag: englishWriteTag,
      entry: 'redirect',
    })
    const initialProducer = next.render$(pathname)
    let consumer: ReturnType<typeof next.render$> | undefined
    let specificProducer: ReturnType<typeof next.render$> | undefined
    try {
      await fill.waitUntilStarted()
      const [initialKey] = (await cache.read()).lookupKeys
      consumer = next.render$(`${pathname}&outer=1`)
      await waitForCrossRequestJoin(next, id)
      await fill.release()
      const { cacheKey: specificKey } = await firstValueWrite.waitUntilStarted()
      await firstRedirectWrite.waitUntilCompleted()
      specificProducer = next.render$(pathname)
      await secondValueWrite.waitUntilStarted()
      const pendingState = await cache.read()
      expect(pendingState.generatedLanguages).toEqual(['en', 'en'])
      expect(
        pendingState.lookupKeys.filter((key) => key === initialKey)
      ).toHaveLength(1)
      expect(
        pendingState.lookupKeys.filter((key) => key === specificKey)
      ).toHaveLength(1)
      await firstValueWrite.release()
      await waitForCrossRequestJoin(next, id, '"lang","en"')
      await secondValueWrite.release()
      await secondValueWrite.waitUntilCompleted()
      await secondRedirectWrite.waitUntilCompleted()
      const [, specificPage, page] = await Promise.all([
        initialProducer,
        specificProducer,
        consumer,
      ])
      expect(page('#value').text()).toBe(specificPage('#value').text())
      expect((await cache.read()).generatedLanguages).toEqual(['en', 'en'])
      expect(page('#value').text()).toStartWith('en:')
    } finally {
      await cache.releaseAll()
      await Promise.allSettled([initialProducer, consumer, specificProducer])
    }
  })
})
