import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createSandbox } from 'development-sandbox'

const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

describe('app-root-params - cache - at runtime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-runtime'),
    skipStart: true,
  })

  if (isNextDev) {
    it('should error when using rootParams within a "use cache" - dev', async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        '/en/us/use-cache'
      )
      const { session } = sandbox
      await session.assertHasRedbox()
      if (isPPREnabled) {
        // When PPR is enabled we verify that we have at least one root param value from generateStaticParams
        // Which this test does not define so we get a different error which preempts the root params error
        expect(await session.getRedboxDescription()).toInclude(
          'Required root params (lang, locale) were not provided in generateStaticParams'
        )
      } else {
        expect(await session.getRedboxDescription()).toInclude(
          'Route /[lang]/[locale]/use-cache used `unstable_rootParams()` inside `"use cache"` or `unstable_cache`'
        )
      }
    })

    it('should error when using rootParams within `unstable_cache` - dev', async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        '/en/us/unstable_cache'
      )
      const { session } = sandbox
      await session.assertHasRedbox()
      if (isPPREnabled) {
        // When PPR is enabled we verify that we have at least one root param value from generateStaticParams
        // Which this test does not define so we get a different error which preempts the root params error
        expect(await session.getRedboxDescription()).toInclude(
          'Required root params (lang, locale) were not provided in generateStaticParams'
        )
      } else {
        expect(await session.getRedboxDescription()).toInclude(
          'Route /[lang]/[locale]/unstable_cache used `unstable_rootParams()` inside `"use cache"` or `unstable_cache`'
        )
      }
    })
  } else {
    beforeAll(async () => {
      try {
        await next.start()
      } catch (_) {
        // We expect the build to fail
      }
    })

    it('should error when using rootParams within a "use cache" - start', async () => {
      if (isPPREnabled) {
        // When PPR is enabled we verify that we have at least one root param value from generateStaticParams
        // Which this test does not define so we get a different error which preempts the root params error
        expect(next.cliOutput).toInclude(
          'Required root params (lang, locale) were not provided in generateStaticParams'
        )
      } else {
        await next.render$('/en/us/use-cache')
        expect(next.cliOutput).toInclude(
          'Error: Route /[lang]/[locale]/use-cache used `unstable_rootParams()` inside `"use cache"` or `unstable_cache`'
        )
      }
    })

    it('should error when using rootParams within `unstable_cache` - start', async () => {
      if (isPPREnabled) {
        // When PPR is enabled we verify that we have at least one root param value from generateStaticParams
        // Which this test does not define so we get a different error which preempts the root params error
        expect(next.cliOutput).toInclude(
          'Required root params (lang, locale) were not provided in generateStaticParams'
        )
      } else {
        await next.render$('/en/us/unstable_cache')
        expect(next.cliOutput).toInclude(
          'Error: Route /[lang]/[locale]/unstable_cache used `unstable_rootParams()` inside `"use cache"` or `unstable_cache`'
        )
      }
    })
  }
})

describe('app-root-params - cache - at build', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'use-cache-build'),
    skipStart: true,
  })

  if (isNextDev) {
    // we omit these tests in dev because they are duplicates semantically to the runtime fixture tested above
    it('noop in dev', () => {})
  } else {
    it('should error when building a project that uses rootParams within `"use cache"`', async () => {
      try {
        await next.start()
      } catch {
        // we expect the build to fail
      }
      expect(next.cliOutput).toInclude(
        'Error: Route /[lang]/[locale]/use-cache used `unstable_rootParams()` inside `"use cache"` or `unstable_cache`'
      )
    })
  }
})
