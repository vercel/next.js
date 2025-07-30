import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createSandbox } from 'development-sandbox'

describe('app-root-param-getters - cache - at runtime', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-runtime'),
    skipStart: true,
    // this test asserts on build failure logs, which aren't currently observable in `next.cliOutput`.
    skipDeployment: true,
  })

  if (skipped) return

  if (isNextDev) {
    it('should error when using root params within a "use cache" - dev', async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        '/en/us/use-cache'
      )
      const { session } = sandbox
      await session.assertHasRedbox()
      expect(await session.getRedboxDescription()).toInclude(
        'Route /[lang]/[locale]/use-cache used `import(\'next/root-params\').lang()` inside `"use cache"` or `unstable_cache`'
      )
    })

    it('should error when using root params within `unstable_cache` - dev', async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        '/en/us/unstable_cache'
      )
      const { session } = sandbox
      await session.assertHasRedbox()
      expect(await session.getRedboxDescription()).toInclude(
        'Route /[lang]/[locale]/unstable_cache used `import(\'next/root-params\').lang()` inside `"use cache"` or `unstable_cache`'
      )
    })
  } else {
    beforeAll(async () => {
      try {
        await next.start()
      } catch (err) {
        // if (isPPREnabled) {
        //   throw err
        // } else {
        //   // in PPR/cacheComponents, we expect the build to fail,
        //   // so we swallow the error and let the tests assert on the logs
        // }
      }
    })

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
