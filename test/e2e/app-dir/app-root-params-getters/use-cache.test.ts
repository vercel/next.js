import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { assertNoRedbox } from 'next-test-utils'

describe('app-root-param-getters - cache - at runtime', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-runtime'),
    // this test asserts on build failure logs, which aren't currently observable in `next.cliOutput`.
    skipDeployment: true,
  })

  if (skipped) return

  if (isNextDev) {
    it('should error when using root params within a "use cache" - dev', async () => {
      const browser = await next.browser('/en/us/use-cache')
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /[lang]/[locale]/use-cache used \`import('next/root-params').lang()\` inside \`"use cache"\` or \`unstable_cache\`. Support for this API inside cache scopes is planned for a future version of Next.js.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/[lang]/[locale]/use-cache/page.tsx (33:28) @ getCachedParams
       > 33 |   return { lang: await lang(), locale: await locale() }
            |                            ^",
         "stack": [
           "getCachedParams app/[lang]/[locale]/use-cache/page.tsx (33:28)",
         ],
       }
      `)
    })

    it('should error when using root params within `unstable_cache` - dev', async () => {
      const browser = await next.browser('/en/us/unstable_cache')
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Route /[lang]/[locale]/unstable_cache used \`import('next/root-params').lang()\` inside \`"use cache"\` or \`unstable_cache\`. Support for this API inside cache scopes is planned for a future version of Next.js.",
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
  } else {
    it('should error when using root params within a "use cache" - start', async () => {
      await next.render$('/en/us/use-cache')
      expect(next.cliOutput).toInclude(
        'Error: Route /[lang]/[locale]/use-cache used `import(\'next/root-params\').lang()` inside `"use cache"` or `unstable_cache`'
      )
    })

    it('should error when using root params within `unstable_cache` - start', async () => {
      await next.render$('/en/us/unstable_cache')
      expect(next.cliOutput).toInclude(
        'Error: Route /[lang]/[locale]/unstable_cache used `import(\'next/root-params\').lang()` inside `"use cache"` or `unstable_cache`'
      )
    })
  }
})

describe('app-root-param-getters - private cache', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-private'),
  })

  if (isNextDev) {
    it('should allow using root params within a "use cache: private" - dev', async () => {
      const browser = await next.browser('/en/us/use-cache-private')

      await assertNoRedbox(browser)
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
    skipStart: true,
  })

  if (isNextDev) {
    // we omit these tests in dev because they are duplicates semantically to the runtime fixture tested above
    it('noop in dev', () => {})
  } else {
    it('should error when building a project that uses root params within `"use cache"`', async () => {
      try {
        await next.start()
      } catch {
        // we expect the build to fail
      }
      expect(next.cliOutput).toInclude(
        'Error: Route /[lang]/[locale]/use-cache used `import(\'next/root-params\').lang()` inside `"use cache"` or `unstable_cache`'
      )
    })
  }
})
