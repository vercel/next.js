import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('stale-dev-types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not fail build when .next/dev has stale types from deleted routes', async () => {
    // Step 1: Wait for dev server to generate .next/dev/types/validator.ts
    await retry(
      async () => {
        const exists = await next
          .readFile('.next/dev/types/validator.ts')
          .then(() => true)
          .catch(() => false)
        if (!exists) {
          throw new Error('validator.ts not generated yet')
        }
      },
      5000,
      500
    )

    // Verify validator.ts contains reference to temp-route
    const validatorContent = await next.readFile('.next/dev/types/validator.ts')
    expect(validatorContent).toContain('temp-route/page')

    // Step 2: Stop dev server
    await next.stop()

    // Step 3: Delete the temp-route (simulating user deleting a route)
    await next.deleteFile('app/temp-route/page.tsx')

    // Verify .next/dev/types/validator.ts still references deleted route (stale)
    const staleValidator = await next.readFile('.next/dev/types/validator.ts')
    expect(staleValidator).toContain('temp-route/page')

    // Step 4: Run build - should NOT fail due to stale .next/dev types
    const { exitCode, cliOutput } = await next.build()

    // Build should succeed - stale dev types should be excluded from type checking
    expect(cliOutput).not.toContain(
      "Cannot find module '../../../app/temp-route/page"
    )
    expect(exitCode).toBe(0)
  })
})
