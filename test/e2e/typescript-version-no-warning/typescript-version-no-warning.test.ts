import { nextTestSetup } from 'e2e-utils'

// @force-gate !dev
describe('typescript-version-no-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should not print warning when new typescript version is used with next build', async () => {
    await next.start().catch(() => {})
    expect(next.cliOutput).not.toContain(
      'Minimum recommended TypeScript version is'
    )
  }, 240_000)
})
