import { join } from 'node:path'
import { createApp, useTempDir, runNextCodemod } from '../utils'

describe('next-codemod upgrade', () => {
  it('should upgrade to the canary version', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'canary'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = await runNextCodemod(['upgrade', 'canary'], { cwd: appDir })
      expect(cp.exitCode).toBe(0)

      const pkg = require(join(appDir, 'package.json'))
      expect(pkg.dependencies.next).toContain('canary')
    })
  })

  it('should upgrade to the rc version', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'rc'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = await runNextCodemod(['upgrade', 'rc'], { cwd: appDir })
      expect(cp.exitCode).toBe(0)

      const pkg = require(join(appDir, 'package.json'))
      expect(pkg.dependencies.next).toContain('rc')
    })
  })

  it('should upgrade to the latest version', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'latest'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = await runNextCodemod(['upgrade', 'latest'], { cwd: appDir })
      expect(cp.exitCode).toBe(0)

      const pkg = require(join(appDir, 'package.json'))
      const installedNextVersion = require(
        require.resolve('next/package.json', {
          paths: [appDir],
        })
      ).version

      expect(pkg.dependencies.next).toBe(installedNextVersion)
    })
  })
})
