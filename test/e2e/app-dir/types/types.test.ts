import { execSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

// This suite invokes the local typegen CLI and checks generated types.
// Deployment mode does not expose that local command or its output files.
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
