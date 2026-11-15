import { execSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

// @force-gate !deploy
describe('app-dir types', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should check types', async () => {
    execSync('pnpm next typegen', { cwd: next.testDir, stdio: 'inherit' })
    execSync('pnpm tsc', { cwd: next.testDir, stdio: 'inherit' })
  })
})
