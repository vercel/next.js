import { nextTestSetup } from 'e2e-utils'
import { pathExists, readdir, readFile } from 'fs-extra'
import { join } from 'path'

// CPU profiling only works with a local `next build`: dev never builds, and
// deploy builds remotely.
// @force-gate !deploy && !dev
describe('CPU Profiling - next build', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    buildCommand: 'pnpm next build --experimental-cpu-prof',
    dependencies: {},
    skipStart: true,
  })

  beforeAll(async () => {
    // Run the build with CPU profiling enabled
    await next.build()
  })

  it('should write a .gitignore into .next-profiles', async () => {
    const gitignore = join(next.testDir, '.next-profiles', '.gitignore')
    expect(await pathExists(gitignore)).toBe(true)
    // `*` keeps the (potentially large) profiling output out of git and away
    // from gitignore-respecting tools that would otherwise scan it.
    expect(await readFile(gitignore, 'utf8')).toContain('*')
  })

  it('should create CPU profile files after build', async () => {
    const profileDir = join(next.testDir, '.next-profiles')

    const profileDirExists = await pathExists(profileDir)
    expect(profileDirExists).toBe(true)

    const files = await readdir(profileDir)
    const cpuProfiles = files.filter((f: string) => f.endsWith('.cpuprofile'))

    // Main profile should always exist
    expect(cpuProfiles.some((f) => f.startsWith('build-main-'))).toBe(true)

    // `next.config.js` pins `experimental.cpus` to 2, so the build starts
    // exactly two static workers. Each must write its own profile; the PID in
    // the filename keeps workers that exit in the same second from colliding.
    const staticWorkerProfiles = cpuProfiles.filter((f) =>
      f.startsWith('build-static-worker-')
    )
    expect(staticWorkerProfiles).toHaveLength(2)
    const staticWorkerPids = staticWorkerProfiles.map(
      (f) => /-(\d+)\.cpuprofile$/.exec(f)?.[1]
    )
    expect(staticWorkerPids).not.toContain(undefined)
    expect(new Set(staticWorkerPids).size).toBe(2)

    if (isTurbopack) {
      // Turbopack builds in the main build process, so the profiles are
      // build-main plus the two static workers.
      expect(cpuProfiles.length).toBe(3)
    } else {
      // Webpack mode additionally generates build-webpack-client,
      // build-webpack-server and build-webpack-edge-server.
      expect(cpuProfiles.length).toBe(6)
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

    for (const file of cpuProfiles) {
      const profile = JSON.parse(await readFile(join(profileDir, file), 'utf8'))
      expect(Array.isArray(profile.nodes)).toBe(true)
      expect(profile.nodes.length).toBeGreaterThan(0)
    }
  })
})
