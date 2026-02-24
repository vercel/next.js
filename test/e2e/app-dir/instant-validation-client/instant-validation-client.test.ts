import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - instant-validation-client', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should error when a client component exports unstable_instant', async () => {
    const expectedErrMsg = process.env.IS_TURBOPACK_TEST
      ? `Next.js can't recognize the exported \`unstable_instant\` field in route. App pages cannot export "unstable_instant" from a Client Component module. To use this API, convert this module to a Server Component by removing the "use client" directive.`
      : `Page "/page" cannot export "unstable_instant" from a Client Component module. To use this API, convert this module to a Server Component by removing the "use client" directive.`

    if (isNextDev) {
      await next.start().catch(() => {})
      await next.browser('/').catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(expectedErrMsg)
      })
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(expectedErrMsg)
    }
  })
})
