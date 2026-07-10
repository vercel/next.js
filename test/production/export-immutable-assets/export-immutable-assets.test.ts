import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { listClientChunks } from 'next-test-utils'

// Immutable static files are only supported with Turbopack anywy
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'output: export - immutable assets disabled',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      // `next start` does not work with `output: 'export'`.
      skipStart: true,
      disableAutoSkewProtection: true,
    })

    // supportsImmutableAssets is designed to work with adapters. It must be
    // force-disabled for `output: 'export'`, so even though it is requested here
    // the build should not emit any `_next/static/immutable` assets.
    // We can loosen this requirement in the future when using output=export together with an adapter
    it('does not emit any _next/static/immutable files', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const files = await listClientChunks(join(next.testDir, next.distDir))

      expect(files).not.toBeEmpty()
      expect(files).toSatisfyAll((f) => f.includes('static/'))
      expect(files).toSatisfyAll((f) => !f.includes('static/immutable/'))
    })
  }
)
