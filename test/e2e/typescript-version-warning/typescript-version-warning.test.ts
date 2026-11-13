import { nextTestSetup } from 'e2e-utils'

// @force-gate !dev
describe('typescript-version-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      typescript: '4.0.6',
    },
  })

  it('should print warning when old typescript version is used with next build', async () => {
    await next.start().catch(() => {})
    expect(next.cliOutput).toContain(
      'Minimum recommended TypeScript version is v5.1.0, older versions can potentially be incompatible with Next.js. Detected: 4.0.6'
    )
  }, 240_000)
})
