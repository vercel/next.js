import path from 'path'
import { nextBuild } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('build trace with extra entries in monorepo', () => {
  describe('production mode', () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should build and trace correctly', async () => {
      const appDir = path.join(next.testDir, 'app')
      const result = await nextBuild(appDir, undefined, {
        cwd: appDir,
        stderr: true,
        stdout: true,
      })
      expect(result.code).toBe(0)

      const appDirRoute1Trace = JSON.parse(
        await next.readFile('app/.next/server/app/route1/route.js.nft.json')
      )

      expect(appDirRoute1Trace.files).toContain(
        '../../../../../other/included.txt'
      )
    })
  })
})
