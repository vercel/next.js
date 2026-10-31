import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import { getDistDir, retry } from 'next-test-utils'

// Regression test for a dev typegen bug introduced in 16.4.0 (follow-up to
// #99377). When an app only has metadata files (favicon, icon, sitemap, ...)
// and no `route.ts`, the dev type generator still imported
// `AppRouteHandlerRoutes` and `NextRequest` into `.next/dev/types/validator.ts`
// even though the `RouteHandlerConfig` block that consumes them is no longer
// emitted (metadata files are excluded from route-handler validation). Under
// `noUnusedLocals` that made `tsc --noEmit` fail with TS6133 / TS6196.
//
// Only the dev type generation emits route-handler validations for metadata
// files, so this suite is dev-only.
//
// @force-gate dev
describe('dev-typegen-validator-unused-imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('does not import route-handler types into the dev validator for a metadata-only app', async () => {
    await next.start()
    await next.fetch('/')

    try {
      // In dev, route types are generated asynchronously after the server
      // starts, so retry until the generated file settles.
      await retry(async () => {
        const validator = await next.readFile(
          `${getDistDir()}/types/validator.ts`
        )
        // Sanity check that dev type generation ran (page/layout are validated).
        expect(validator).toContain('const handler = {} as typeof import(')
        // With no route handlers, the route-handler-only imports must not be
        // emitted, otherwise they are unused.
        expect(validator).not.toContain('AppRouteHandlerRoutes')
        expect(validator).not.toContain('NextRequest')
      })
    } finally {
      await next.stop()
    }
  })

  it('passes `tsc --noEmit` with noUnusedLocals after the dev server generates types', async () => {
    await next.start()
    await next.fetch('/')

    try {
      await retry(async () => {
        const { stdout, stderr } = await execa('pnpm', ['tsc', '--noEmit'], {
          cwd: next.testDir,
          reject: false,
        })

        expect({ stdout, stderr }).toEqual({
          stdout: '',
          stderr: '',
        })
      })
    } finally {
      await next.stop()
    }
  })
})
