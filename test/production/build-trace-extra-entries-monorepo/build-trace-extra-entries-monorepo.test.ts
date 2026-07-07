import path from 'path'
import { nextTestSetup } from 'e2e-utils'

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
})
