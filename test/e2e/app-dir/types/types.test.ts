import { execSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

const repoTypeScriptVersion: string = require('../../../../package.json')
  .devDependencies.typescript

describe('app-dir types', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('uses the repo TypeScript version', async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson.dependencies.typescript).toBe(repoTypeScriptVersion)

    if (!process.env.NEXT_SKIP_ISOLATE) {
      const installedPackageJson = JSON.parse(
        await next.readFile('node_modules/typescript/package.json')
      )
      expect(installedPackageJson.version).toBe(repoTypeScriptVersion)
    }
  })

  it('should check types', async () => {
    execSync('pnpm next typegen', { cwd: next.testDir, stdio: 'inherit' })
    execSync('pnpm tsc', { cwd: next.testDir, stdio: 'inherit' })
  })
})
