import { join } from 'node:path'
import { check } from 'next-test-utils'
import { createApp, useTempDir, runNextCodemodPrompt } from '../utils'

describe('next-codemod upgrade prompt', () => {
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

      expect(pkg.dependencies.next).toBe(installedNextVersion)
    })
  })
})
