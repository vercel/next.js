import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('build trace with extra entries in monorepo', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should build and trace correctly', async () => {
      const appDir = path.join(next.testDir, 'app')
      const { exitCode } = await next.runCommand(['build'], {
        cwd: appDir,
      })
      expect(exitCode).toBe(0)

      const appDirRoute1Trace = JSON.parse(
        await next.readFile('app/.next/server/app/route1/route.js.nft.json')
      )

      expect(appDirRoute1Trace.files).toContain(
        '../../../../../other/included.txt'
      )
    })
  })

  // @force-gate webpack
  describe('standalone output outside outputFileTracingRoot', () => {
    const { next, skipped } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'app/app')),
        '../other': new FileRef(path.join(__dirname, 'other')),
      },
      subDir: 'app',
      nextConfig: {
        output: 'standalone',
        outputFileTracingRoot: '.',
        outputFileTracingIncludes: {
          '/route1': ['../other/included.txt'],
        },
      },
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('warns and completes the build', async () => {
      const { exitCode, cliOutput } = await next.runCommand(['build'])

      expect(exitCode).toBe(0)
      expect(cliOutput).toMatch(
        /\d+ traced files were not included in the standalone output/
      )
      expect(cliOutput).toContain('First 100 skipped files:')
      expect(cliOutput).toContain('outputFileTracingRoot')
    })
  })
})
