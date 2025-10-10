import { nextTestSetup } from 'e2e-utils'

describe('deprecation-warning-runtime-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn when imported "next/config" module', async () => {
    // Navigate to "/" for dev server to execute the code
    await next.browser('/')

    expect(next.cliOutput).toContain(
      'Runtime config is deprecated and will be removed in Next.js 16. Please remove the usage of "next/config" from your project.'
    )
  })
})
