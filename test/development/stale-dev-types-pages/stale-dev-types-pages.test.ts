import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('stale-dev-types-pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not fail build with Duplicate identifier when dev types are stale after route deletion', async () => {
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

    // Verify PagesPageConfig is in the validator (Pages Router pages exist)
    const validatorContent = await next.readFile('.next/dev/types/validator.ts')
    expect(validatorContent).toContain('PagesPageConfig')

    // Step 2: Stop dev server
    await next.stop()

    // Step 3: Delete the api folder (simulating user deleting pages/api)
    await next.deleteFile('pages/api/hello.ts')

    // Verify .next/dev/types/validator.ts still contains stale ApiRouteConfig
    const staleValidator = await next.readFile('.next/dev/types/validator.ts')
    expect(staleValidator).toContain('ApiRouteConfig')

    // Step 4: Run build — should NOT fail with duplicate identifier error
    const { exitCode, cliOutput } = await next.build()

    // Build should succeed — stale dev types should be excluded from type checking
    expect(cliOutput).not.toContain('Duplicate identifier')
    expect(cliOutput).not.toContain('PagesPageConfig')
    expect(exitCode).toBe(0)
  })
})
