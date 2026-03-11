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
         "code": "E1137",
         "description": "Route /[lang]/[locale]/unstable_cache used \`import('next/root-params').lang()\` inside \`unstable_cache\`. This is not supported. Use \`"use cache"\` instead.",
         "environmentLabel": "Server",
         "label": "Runtime Error",
         "source": "app/[lang]/[locale]/unstable_cache/page.tsx (33:28) @ uncachedGetParams
       > 33 |   return { lang: await lang(), locale: await locale() }
            |                            ^",
         "stack": [
           "uncachedGetParams app/[lang]/[locale]/unstable_cache/page.tsx (33:28)",
           "Runtime app/[lang]/[locale]/unstable_cache/page.tsx (17:22)",
         ],
       }
      `)
    })

    it('should error when using root params in "use cache" nested inside unstable_cache - dev', async () => {
      const browser = await next.browser('/en/us/nested-in-unstable_cache')
      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1136",
         "description": "Route /[lang]/[locale]/nested-in-unstable_cache used \`import('next/root-params').lang()\` inside \`"use cache"\` nested within \`unstable_cache\`. Root params are not available in this context.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/[lang]/[locale]/nested-in-unstable_cache/page.tsx (29:28) @ getCachedParams
       > 29 |   return { lang: await lang(), locale: await locale() }
            |                            ^",
         "stack": [
           "getCachedParams app/[lang]/[locale]/nested-in-unstable_cache/page.tsx (29:28)",
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

      await browser.loadPage(next.url + '/fr/de/use-cache')
      expect(await browser.elementById('param').text()).toBe('fr de')
      const frRandom = await browser.elementById('random').text()

      // Different root params must produce different cache entries.
      expect(enRandom).not.toBe(frRandom)

      // Each entry must be individually cached (same random on revisit).
      await browser.loadPage(next.url + '/en/us/use-cache')
      expect(await browser.elementById('random').text()).toBe(enRandom)

      await browser.loadPage(next.url + '/fr/de/use-cache')
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

    if (!isNextDeploy) {
      it('should error when using root params within `unstable_cache` - start', async () => {
        await next.render$('/en/us/unstable_cache')
        expect(next.cliOutput).toInclude(
          "Error: Route /[lang]/[locale]/unstable_cache used `import('next/root-params').lang()` inside `unstable_cache`"
        )
      })

      it('should error when using root params in "use cache" nested inside unstable_cache - start', async () => {
        await next.render$('/en/us/nested-in-unstable_cache')
        expect(next.cliOutput).toInclude(
          'Error: Route /[lang]/[locale]/nested-in-unstable_cache used `import(\'next/root-params\').lang()` inside `"use cache"` nested within `unstable_cache`. Root params are not available in this context.'
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
