import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import { pathExists, readdir } from 'fs-extra'
import { join } from 'path'

describe('CPU Profiling - next build', () => {
  const { next, isNextDev, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --experimental-cpu-prof',
    dependencies: {},
    skipStart: true,
    skipDeployment: true,
  })

  // CPU profiling only works with local `next build`, not dev or deploy modes
  if (isNextDev || isNextDeploy || skipped) {
    it('skip for development/deploy mode', () => {})
    return
  }

  beforeAll(async () => {
    // Run the build with CPU profiling enabled
    await next.build()
  })

  it('should create CPU profile files after build', async () => {
    const profileDir = join(next.testDir, '.next', 'cpu-profiles')

    const profileDirExists = await pathExists(profileDir)
    expect(profileDirExists).toBe(true)

    const files = await readdir(profileDir)
    const cpuProfiles = files.filter((f: string) => f.endsWith('.cpuprofile'))

    // Main profile should always exist
    expect(cpuProfiles.some((f) => f.startsWith('build-main-'))).toBe(true)

    if (isTurbopack) {
      // Turbopack mode generates: build-main, build-turbopack
      expect(cpuProfiles.length).toBe(2)
      expect(cpuProfiles.some((f) => f.startsWith('build-turbopack-'))).toBe(
        true
      )
    } else {
      // Webpack mode generates: build-main, build-webpack-client, build-webpack-server, build-webpack-edge-server
      expect(cpuProfiles.length).toBe(4)
      expect(
        cpuProfiles.some((f) => f.startsWith('build-webpack-client-'))
      ).toBe(true)
      expect(
        cpuProfiles.some((f) => f.startsWith('build-webpack-server-'))
      ).toBe(true)
      expect(
        cpuProfiles.some((f) => f.startsWith('build-webpack-edge-server-'))
      ).toBe(true)
    }
  })
})
