import { nextTestSetup } from 'e2e-utils'
import { pathExists, readdir } from 'fs-extra'
import { join } from 'path'
import { retry } from 'next-test-utils'

describe('CPU Profiling - next dev', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    startCommand: 'pnpm next dev --experimental-cpu-prof',
    dependencies: {},
  })

  if (!isNextDev) {
    it('skip for production mode', () => {})
    return
  }

  it('should create CPU profile files on exit', async () => {
    const profileDir = join(next.testDir, '.next', 'cpu-profiles')

    // Make a request to ensure the server is running
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    // Stop the server with SIGTERM to trigger profile save (SIGKILL doesn't allow cleanup)
    await next.stop('SIGTERM')

    // Retry until profile files are written
    const cpuProfiles = await retry(async () => {
      const profileDirExists = await pathExists(profileDir)
      expect(profileDirExists).toBe(true)

      const files = await readdir(profileDir)
      const profiles = files.filter((f: string) => f.endsWith('.cpuprofile'))
      expect(profiles.length).toBeGreaterThanOrEqual(1)
      return profiles
    })

    // Verify profile names are meaningful
    for (const profile of cpuProfiles) {
      expect(profile).toMatch(
        /^(dev-main|dev-server)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.cpuprofile$/
      )
    }
  })
})
