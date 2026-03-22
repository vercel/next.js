import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { assertNoConsoleErrors, retry, waitForNoRedbox } from 'next-test-utils'

describe('app-root-param-getters - cache - at runtime', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-runtime'),
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
         "code": "E1141",
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
         "code": "E1140",
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

      // If the Resume Data Cache lookup missed during the resume (e.g. due
      // to a key mismatch caused by root params), the "use cache" function
      // would re-execute and produce a different random value than the one
      // in the prerendered shell, causing a hydration error.
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

      // Wait for the cache to settle by verifying the random value is
      // stable across two consecutive loads.
      let frRandom: string = ''
      await retry(async () => {
        await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
        frRandom = await browser.elementById('random').text()
        await browser.loadPage(next.url + '/fr/ca/conditional-on-another-cache')
        expect(await browser.elementById('random').text()).toBe(frRandom)
      })

      // Different root params must now produce different entries because
      // lang is being read.
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
    // we omit these tests in dev because they are duplicates semantically to the runtime fixture tested above
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
