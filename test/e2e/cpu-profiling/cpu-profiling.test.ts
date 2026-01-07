import { nextTestSetup, isNextDeploy } from 'e2e-utils'
import { pathExists, readdir } from 'fs-extra'
import { join } from 'path'
import { retry } from 'next-test-utils'

describe('CPU Profiling - next start', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    startCommand: 'pnpm next start --experimental-cpu-prof',
    dependencies: {},
    skipStart: true, // Skip auto-start to avoid failure in dev/deploy mode
  })

  // CPU profiling only works with local `next start`, not dev or deploy modes
  if (isNextDev || isNextDeploy || skipped) {
    it('skip for development/deploy mode', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

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
      expect(profiles.length).toBeGreaterThan(0)
      return profiles
    })

    // Verify profile name is meaningful (start-main)
    for (const profile of cpuProfiles) {
      expect(profile).toMatch(
        /^start-main-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.cpuprofile$/
      )
    }
  })
})
