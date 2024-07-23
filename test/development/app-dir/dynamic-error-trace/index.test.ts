import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxCallStack,
  shouldRunTurboDevTest,
  expandCallStack,
  getRedboxSource,
} from 'next-test-utils'

const isPPREnabled = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
const gateNotReactExperimental = isPPREnabled ? it.failing : it

describe('app dir - dynamic error trace', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      swr: 'latest',
    },
    packageJson: {
      scripts: {
        build: 'next build',
        dev: `next ${shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'}`,
        start: 'next start',
      },
    },
    installCommand: 'pnpm install',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    buildCommand: 'pnpm build',
    skipDeployment: true,
  })
  if (skipped) return

  gateNotReactExperimental('should show the error trace', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)
    await expandCallStack(browser)
    const callStack = await getRedboxCallStack(browser)

    // eslint-disable-next-line jest/no-standalone-expect -- this is a test
    expect(callStack).toContain('node_modules/headers-lib/index.mjs')

    const source = await getRedboxSource(browser)
    // eslint-disable-next-line jest/no-standalone-expect -- this is a test
    expect(source).toContain('app/lib.js')
  })
})
