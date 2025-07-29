import { nextTestSetup } from 'e2e-utils'
import { shouldRunTurboDevTest } from 'next-test-utils'

describe('monorepo-multi-lockfile - has-output-file-tracing-root', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    buildCommand: `pnpm next build apps/has-output-file-tracing-root`,
    startCommand: `pnpm next apps/has-output-file-tracing-root ${
      (global as any).isNextDev
        ? shouldRunTurboDevTest()
          ? 'dev --turbopack'
          : 'dev'
        : 'start'
    }`,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not have multi lockfile warning', async () => {
    expect(next.cliOutput).not.toContain(
      'Warning: Next.js inferred your workspace root, but it may not be correct.'
    )
  })
})
