import { nextTestSetup } from 'e2e-utils'
import { shouldRunTurboDevTest } from 'next-test-utils'

describe('monorepo-multi-lockfile', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    buildCommand: `pnpm next build apps/has-nothing`,
    startCommand: `pnpm next apps/has-nothing ${
      (global as any).isNextDev
        ? shouldRunTurboDevTest()
          ? 'dev --turbopack'
          : 'dev'
        : 'start'
    }`,
    skipDeployment: true,
    expectToThrow: true,
    serverReadyPattern: / ✓ Starting...\n/,
  })

  if (skipped) {
    return
  }

  console.log('INSIDE TEST', { isTurbopack: Boolean(process.env.TURBOPACK) })

  it('should have multi lockfile warning', async () => {
    expect(next.cliOutput).toContain(
      'Warning: Next.js inferred your workspace root, but it may not be correct.'
    )

    if (isTurbopack) {
      expect(next.cliOutput).toContain('`turbopack.root`')
    } else {
      expect(next.cliOutput).toContain('`outputFileTracingRoot`')
    }
  })
})
