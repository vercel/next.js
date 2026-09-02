import { nextTestSetup } from 'e2e-utils'

// Deploy mode exclusion: This suite asserts local CLI or runtime logs that deployments do not expose.
// The test asserts on `next.cliOutput`, expecting the local
// `next build` failure message ("To use a multi-match in the
// destination..."). In deploy mode `next.cliOutput` contains the
// Vercel deploy log, which doesn't surface the same Next.js build
// error string at the top level, so the assertions don't apply.
// @force-gate !deploy
describe('Custom routes invalid multi-match', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
  })

  it('should show error for invalid multi-match', async () => {
    await next.render('/random')
    expect(next.cliOutput).toContain(
      'To use a multi-match in the destination you must add'
    )
    expect(next.cliOutput).toContain(
      'https://nextjs.org/docs/messages/invalid-multi-match'
    )
  })
})
