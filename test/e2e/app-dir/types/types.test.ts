import { execSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
// @force-gate !deploy
describe('app-dir types', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should check types', async () => {
    execSync('pnpm next typegen', { cwd: next.testDir, stdio: 'inherit' })
    execSync('pnpm tsc', { cwd: next.testDir, stdio: 'inherit' })
  })
})
