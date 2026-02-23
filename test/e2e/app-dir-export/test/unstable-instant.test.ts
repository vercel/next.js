import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - with output export - unstable_instant', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: join(__dirname, '..'),
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should error when client component has unstable_instant', async () => {
    await next.patchFile('app/client/page.js', (content) =>
      content.replace(
        `'use client'\n`,
        `'use client'\n\nexport const unstable_instant = { prefetch: 'runtime', samples: [{}] }\n\n`
      )
    )

    const expectedErrMsg = process.env.IS_TURBOPACK_TEST
      ? `Next.js can't recognize the exported \`unstable_instant\` field in route. App pages cannot use both "use client" and export const "unstable_instant".`
      : `Page "/client/page" cannot use both "use client" and export const "unstable_instant".`

    if (isNextDev) {
      await next.start().catch(() => {})
      await next.browser('/client').catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(expectedErrMsg)
      })
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(expectedErrMsg)
    }
  })
})
