import { nextTestSetup } from 'e2e-utils'
import { readdir, readFile } from 'fs-extra'
import { join } from 'path'

// `experimental.turbopackBuildWorker` only applies to Turbopack builds.
// @force-gate turbopack
describe('turbopack-build-worker CPU profiling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --experimental-cpu-prof',
    skipStart: true,
  })

  it('should write a CPU profile for the build worker', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const profileDir = join(next.testDir, '.next-profiles')
    const files = await readdir(profileDir)
    const workerProfiles = files.filter(
      (f) => f.startsWith('build-turbopack-') && f.endsWith('.cpuprofile')
    )
    expect(workerProfiles).toHaveLength(1)
    // The main process is still profiled too.
    expect(files.some((f) => f.startsWith('build-main-'))).toBe(true)

    const profile = JSON.parse(
      await readFile(join(profileDir, workerProfiles[0]), 'utf8')
    )
    expect(profile.nodes.length).toBeGreaterThan(0)
  })
})
