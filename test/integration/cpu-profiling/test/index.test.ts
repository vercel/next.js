/* eslint-env jest */

import { remove, pathExists, readdir } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, '..', 'fixtures')
const appDir = join(fixturesDir, 'basic-app')

describe('CPU Profiling', () => {
  beforeEach(async () => {
    await remove(join(appDir, '.next'))
  })

  describe('next build --experimental-cpu-prof', () => {
    it('should create CPU profile files with meaningful names', async () => {
      const profileDir = join(appDir, '.next', 'cpu-profiles')

      const { stdout } = await nextBuild(appDir, ['--experimental-cpu-prof'], {
        stdout: true,
        stderr: true,
      })

      expect(stdout).toContain('CPU profile saved')

      const profileDirExists = await pathExists(profileDir)
      expect(profileDirExists).toBe(true)

      const files = await readdir(profileDir)
      const cpuProfiles = files.filter((f) => f.endsWith('.cpuprofile'))
      expect(cpuProfiles.length).toBeGreaterThan(0)

      // Verify profile names are meaningful (not just random numbers)
      for (const profile of cpuProfiles) {
        // Profile names should contain descriptive prefixes like 'build-main', 'build-webpack-server', etc.
        expect(profile).toMatch(
          /^(build-main|build-webpack-(server|client|edge-server)|build-turbopack|build-static-worker|build-trace-worker)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.cpuprofile$/
        )
      }
    })

    it('should create profiles for worker processes', async () => {
      const profileDir = join(appDir, '.next', 'cpu-profiles')

      await nextBuild(appDir, ['--experimental-cpu-prof'], {
        stdout: true,
        stderr: true,
      })

      const files = await readdir(profileDir)
      const cpuProfiles = files.filter((f) => f.endsWith('.cpuprofile'))

      // Should have at least main process profile and potentially worker profiles
      expect(cpuProfiles.length).toBeGreaterThanOrEqual(1)

      // Verify we have the main build profile
      const mainProfile = cpuProfiles.find((f) => f.startsWith('build-main'))
      expect(mainProfile).toBeDefined()
    })
  })
})
