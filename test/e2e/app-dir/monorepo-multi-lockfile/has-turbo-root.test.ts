import { nextTestSetup } from 'e2e-utils'
import { shouldRunTurboDevTest } from 'next-test-utils'

describe('monorepo-multi-lockfile - has-turbo-root', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    buildCommand: `pnpm next build apps/has-turbo-root`,
    startCommand: `pnpm next apps/has-turbo-root ${
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
