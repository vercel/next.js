import { nextTestSetup } from 'e2e-utils'

describe('dynamic-params-no-fallback-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/90537
  // NoFallbackError is an internal control-flow mechanism that should not
  // be logged to console.error when dynamicParams = false rejects a param.
  it('should not log NoFallbackError to console.error on 404', async () => {
    // Valid param should return 200
    const validRes = await next.fetch('/about')
    expect(validRes.status).toBe(200)

    // Invalid param should return 404 without logging NoFallbackError
    const invalidRes = await next.fetch('/nonexistent')
    expect(invalidRes.status).toBe(404)

    // Check that NoFallbackError was not logged
    expect(next.cliOutput).not.toContain('NoFallbackError')
  })
})
