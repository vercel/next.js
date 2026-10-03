import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This policy deliberately fails validation, so the app cannot be deployed.
// @force-gate !deploy
describe('param-matching-parallel-catchall', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('rejects a catch-all policy for a parameter outside the matched pathname', async () => {
    if (isNextDev) {
      await next.start()
      expect((await next.fetch('/one')).status).toBe(500)
    } else {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
    }

    // "parts" is in scope for the sidebar's export, but /[slug] supplies its
    // value from the matched pathname rather than having a [parts] parameter.
    await retry(() => {
      expect(next.cliOutput).toContain(
        'Invalid parameter "parts" in `unstable_paramMatching` for "/[slug]". Parameter matching may only configure dynamic parameters in this route.'
      )
    })
    expect(next.cliOutput).not.toContain(
      'may only configure parameters defined at or above its segment'
    )
  })
})
