import { createNextDescribe } from 'e2e-utils'
import {
  getRedboxCallStack,
  hasRedbox,
  shouldRunTurboDevTest,
  expandCallStack,
  getRedboxSource,
} from 'next-test-utils'

createNextDescribe(
  'app dir - dynamic error trace',
  {
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
  },
  ({ next }) => {
    it('should show the error trace', async () => {
      const browser = await next.browser('/')
      await hasRedbox(browser)
      await expandCallStack(browser)
      const callStack = await getRedboxCallStack(browser)

      expect(callStack).toContain('node_modules/headers-lib/index.mjs')

      const source = await getRedboxSource(browser)
      expect(source).toContain('app/lib.js')
    })
  }
)
