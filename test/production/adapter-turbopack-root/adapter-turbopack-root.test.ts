import fs from 'fs-extra'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

// Webpack builds keep reporting the detected repository root.
// @force-gate turbopack
describe('adapter-turbopack-root', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    subDir: 'project',
    skipStart: true,
  })

  let sharedFile: string

  beforeAll(async () => {
    sharedFile = path.join(path.dirname(next.testDir), 'shared-data.txt')
    await fs.writeFile(sharedFile, 'shared-root-data')
  })

  afterAll(async () => {
    await fs.remove(sharedFile)
  })

  it('makes asset paths relative to a Turbopack root that is wider than the repository root', async () => {
    const { exitCode } = await next.build({
      env: { NEXT_PRIVATE_OUTPUT_TRACE_ROOT: next.testDir },
    })
    expect(exitCode).toBe(0)

    const buildComplete: Parameters<
      NonNullable<NextAdapter['onBuildComplete']>
    >[0] = await next.readJSON('build-complete.json')
    expect(buildComplete.config.repoRoot).toBe(next.testDir)
    expect(buildComplete.repoRoot).toBe(buildComplete.config.turbopack?.root)
    expect(buildComplete.repoRoot).toBe(path.dirname(next.testDir))

    const output = buildComplete.outputs.appPages.find(
      (output) => output.pathname === '/'
    )!
    expect(output).toBeDefined()
    expect(
      path.relative(buildComplete.repoRoot, output.filePath).split(path.sep)[0]
    ).not.toBe('..')
    expect(await fs.realpath(output.assets['shared-data.txt'])).toBe(
      await fs.realpath(sharedFile)
    )
    for (const destination of Object.keys(output.assets)) {
      expect(path.isAbsolute(destination)).toBe(false)
      expect(destination.split(path.sep)[0]).not.toBe('..')
    }
  })
})
