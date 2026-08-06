import path from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'

describe('CPU Profiling', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/basic-app'),
    skipStart: true,
  })

  describe('next build --experimental-cpu-prof', () => {
    it('should create CPU profile files with meaningful names', async () => {
      await next.build({ args: ['--experimental-cpu-prof'] })

      expect(next.cliOutput).toContain('CPU profile saved')

      const profileDir = path.join(next.testDir, '.next-profiles')
      const profileDirExists = await fs.pathExists(profileDir)
      expect(profileDirExists).toBe(true)

      const files = await fs.readdir(profileDir)
      const cpuProfiles = files.filter((f: string) => f.endsWith('.cpuprofile'))
      expect(cpuProfiles.length).toBeGreaterThan(0)

      for (const profile of cpuProfiles) {
        expect(profile).toMatch(
          /^(build-main|build-webpack-(server|client|edge-server)|build-turbopack|build-static-worker|build-trace-worker)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.cpuprofile$/
        )
      }
    })

    it('should create profiles for worker processes', async () => {
      await next.build({ args: ['--experimental-cpu-prof'] })

      const profileDir = path.join(next.testDir, '.next-profiles')
      const files = await fs.readdir(profileDir)
      const cpuProfiles = files.filter((f: string) => f.endsWith('.cpuprofile'))

      expect(cpuProfiles.length).toBeGreaterThanOrEqual(1)

      const mainProfile = cpuProfiles.find((f: string) =>
        f.startsWith('build-main')
      )
      expect(mainProfile).toBeDefined()
    })
  })
})
