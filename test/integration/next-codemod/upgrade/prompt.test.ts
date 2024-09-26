import { join } from 'node:path'
import { createApp, runNextCodemodPrompt, useTempDir } from '../utils'
import { check } from 'next-test-utils'

describe('next-codemod upgrade prompt', () => {
  let canaryVersion: string | undefined
  let rcVersion: string | undefined
  let latestVersion: string | undefined

  beforeAll(async () => {
    try {
      // Ideally, it's good to test by fetching the versions from the registry.
      // But this could be flaky, so we look for the keywords as well.
      const canaryRes = await fetch('https://registry.npmjs.org/next/canary')
      const rcRes = await fetch('https://registry.npmjs.org/next/rc')
      const latestRes = await fetch('https://registry.npmjs.org/next/latest')

      canaryVersion = (await canaryRes.json()).version
      rcVersion = (await rcRes.json()).version
      latestVersion = (await latestRes.json()).version
    } catch (error) {
      console.error('Failed to fetch next versions:\n', error)
    }
  })

  it('should upgrade to the canary version when selected in prompt', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'canary'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = runNextCodemodPrompt(['upgrade'], { cwd: appDir })
      await new Promise<void>(async (resolve) => {
        cp.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })

        let output = ''
        cp.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        await check(
          () => output,
          /Which Next.js release do you want to upgrade to/
        )
        // select canary
        cp.stdin.write(`\n`)
      })

      const pkg = require(join(appDir, 'package.json'))
      if (canaryVersion) {
        expect(pkg.dependencies.next).toBe(canaryVersion)
      }
      expect(pkg.dependencies.next).toContain('canary')
    })
  })

  it('should upgrade to the rc version when selected in prompt', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'rc'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = runNextCodemodPrompt(['upgrade'], { cwd: appDir })
      await new Promise<void>(async (resolve) => {
        cp.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })

        let output = ''
        cp.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        await check(
          () => output,
          /Which Next.js release do you want to upgrade to/
        )
        // cursor below, select rc
        cp.stdin.write('\u001b[B\n')
      })

      const pkg = require(join(appDir, 'package.json'))
      if (rcVersion) {
        expect(pkg.dependencies.next).toBe(rcVersion)
      }
      expect(pkg.dependencies.next).toContain('rc')
    })
  })

  it('should upgrade to the latest version when selected in prompt', async () => {
    await useTempDir(async (cwd) => {
      const appName = 'latest'
      const appDir = join(cwd, appName)
      const app = await createApp([appName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const cp = runNextCodemodPrompt(['upgrade'], { cwd: appDir })
      await new Promise<void>(async (resolve) => {
        cp.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })

        let output = ''
        cp.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        await check(
          () => output,
          /Which Next.js release do you want to upgrade to/
        )
        // cursor below twice, select latest
        cp.stdin.write('\u001b[B\u001b[B\n')
      })

      const pkg = require(join(appDir, 'package.json'))
      const installedNextVersion = require(
        require.resolve('next/package.json', {
          paths: [appDir],
        })
      ).version

      if (latestVersion) {
        expect(pkg.dependencies.next).toBe(latestVersion)
      }
      expect(pkg.dependencies.next).toBe(installedNextVersion)
    })
  })
})
