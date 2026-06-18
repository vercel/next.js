import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-root', () => {
  describe.each([
    { name: 'via lockfile', env: {} },
    // The Vercel CLI sets this to the repo root
    { name: 'via NEXT_PRIVATE_OUTPUT_TRACE_ROOT', setEnvVar: true },
  ])('$name', ({ setEnvVar }) => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixture'),
      subDir: 'sub',
      skipStart: true,
      overrideFiles: setEnvVar
        ? undefined
        : {
            '../package-lock.json': JSON.stringify({
              name: 'parent-workspace',
              version: '1.0.0',
              lockfileVersion: 3,
            }),
          },
    })

    it('should correctly determine repoRoot', async () => {
      const expectedRepoRoot = path.dirname(next.testDir)

      if (setEnvVar) {
        next.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = expectedRepoRoot
      }
      await next.build()

      expect(next.cliOutput).not.toContain(
        'We detected multiple lockfiles and selected the directory'
      )

      const {
        outputs,
        repoRoot,
        projectDir,
      }: Parameters<NextAdapter['onBuildComplete']>[0] = await next.readJSON(
        'build-complete.json'
      )

      expect(projectDir).toBe(next.testDir)
      expect(repoRoot).toBe(expectedRepoRoot)

      const combinedRouteOutputs = [
        ...outputs.appPages,
        ...outputs.appRoutes,
        ...outputs.pages,
        ...outputs.pagesApi,
      ]
      for (const output of combinedRouteOutputs) {
        for (const [asset, source] of Object.entries(output.assets)) {
          expect(asset).toStartWith('sub/')
          expect(fs.existsSync(source)).toBeTrue()
        }
      }
    })
  })
})
