import { join } from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import { command } from '../utils'

describe('next-codemod', () => {
  let canaryVersion: string | undefined
  // let rcVersion: string | undefined
  // let latestVersion: string | undefined

  beforeAll(async () => {
    try {
      // Ideally, it's good to test by fetching the versions from the registry.
      // But this could be flaky, so we look for the keywords as well.
      const canaryRes = await fetch('https://registry.npmjs.org/next/canary')
      // const rcRes = await fetch('https://registry.npmjs.org/next/rc')
      // const latestRes = await fetch('https://registry.npmjs.org/next/latest')

      canaryVersion = (await canaryRes.json()).version
      // rcVersion = (await rcRes.json()).version
      // latestVersion = (await latestRes.json()).version
    } catch (error) {
      console.error('Failed to fetch next versions:\n', error)
    }
  })

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    dependencies: {
      '@next/codemod': 'canary',
    },
  })

  if (skipped) {
    return
  }

  it('should upgrade to the canary version', async () => {
    const nextCodemodPath = require.resolve('@next/codemod/bin/next-codemod.js')
    const cp = command(nextCodemodPath, ['upgrade', 'canary'], {
      cwd: next.testDir,
    })
    expect(cp.exitCode).toBe(0)

    const pkg = require(join(next.testDir, 'package.json'))
    if (canaryVersion) {
      expect(pkg.dependencies.next).toBe(canaryVersion)
    }
    expect(pkg.dependencies.next).toContain('canary')
  })
})
