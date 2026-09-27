import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Variants are supported with Turbopack only, and enabling them rejects a
// webpack build, which `variants-webpack.test.ts` covers.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    // TODO(variants): a platform serves a variant from its build output, which
    // comes later. No test here depends on that. Nothing resolves a value yet,
    // so every mode fails the read alike.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should fail a read that no value was resolved for', async () => {
    const response = await next.fetch('/')

    // A boundary contains a failed read only if something already served that
    // boundary. What a request receives therefore depends on what the build
    // kept.
    if (isNextStart && process.env.__NEXT_CACHE_COMPONENTS) {
      // A variant is runtime data, so the read interrupts the prerender and
      // leaves a shell that ends at the boundary above it. The server sends
      // that shell, and the boundary stays pending.
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('pending')
    } else {
      // The build kept no shell. The whole route therefore renders per
      // request, and the read fails that request.
      expect(response.status).toBe(500)
    }

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'read variant `theme@variants.ts`, but no value was resolved for this request'
      )
    })
  })
})
