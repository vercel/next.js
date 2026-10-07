import { nextTestSetup } from 'e2e-utils'
import fs from 'fs/promises'
import path from 'path'

// Regression test for the Turbopack persistent build cache: when persisting
// the cache fails while shutting down — e.g. because the cache directory
// cannot be written to anymore (full disk, read-only directory) — `next build`
// keeps reporting success, and prints a warning that includes the full cause
// chain so the underlying filesystem error is actionable.
//
// The failure is injected by making the versioned database directory
// read-only, which only has an effect for a regular (non-root) user on a
// POSIX filesystem.
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It mutates files in the isolated local fixture after setup.
// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
describe('filesystem-cache shutdown diagnostics', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Simulate a non-CI (local) environment so a snapshot is always persisted.
  const BUILD_ENV = {
    CI: '',
    CONTINUOUS_INTEGRATION: '',
    BUILD_NUMBER: '',
    RUN_ID: '',
    GITHUB_ACTIONS: '',
    NOW_BUILDER: '',
    TURBO_ENGINE_IGNORE_DIRTY: '1',
    TURBO_ENGINE_DISABLE_VERSIONING: '1',
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  function databasePath() {
    return path.join(next.testDir, '.next', 'cache', 'turbopack', 'unversioned')
  }

  // Returns each cache warning line together with the line that follows it,
  // which carries the error cause chain.
  function shutdownWarnings(cliOutput: string) {
    const lines = cliOutput.split('\n').map((line) => line.trim())
    return lines.flatMap((line, i) =>
      line.startsWith('WARNING: Saving the filesystem cache failed')
        ? [{ line, cause: lines[i + 1] ?? '' }]
        : []
    )
  }

  it('reports a successful build while printing a warning about cache failures on every build', async () => {
    await fs.rm(path.join(next.testDir, '.next'), {
      recursive: true,
      force: true,
    })
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify(
        { experimental: { turbopackFileSystemCacheForBuild: true } },
        null,
        2
      )}`
    )

    // First build: populates the persistent cache.
    const first = await next.build({ env: BUILD_ENV })
    expect(first.exitCode).toBe(0)
    expect(shutdownWarnings(first.cliOutput)).toEqual([])

    // Make cache maintenance fail for all following builds.
    const dbPath = await databasePath()
    await fs.chmod(dbPath, 0o555)

    const builds: Awaited<ReturnType<typeof next.build>>[] = []
    try {
      // Two more builds: the diagnostic is expected to recur on each of them.
      builds.push(await next.build({ env: BUILD_ENV }))
      builds.push(await next.build({ env: BUILD_ENV }))
    } finally {
      // Restore write permissions so the fixture can be cleaned up.
      await fs.chmod(dbPath, 0o755)
    }

    for (const build of builds) {
      // The build is still reported as successful ...
      expect(build.exitCode).toBe(0)
      expect(build.cliOutput).toContain('Compiled successfully')
      expect(build.cliOutput).toContain('Route (app)')

      // ... while the cache persistence failure is reported exactly once ...
      const warnings = shutdownWarnings(build.cliOutput)
      expect(warnings).toHaveLength(1)
      expect(warnings[0].line).toBe(
        'WARNING: Saving the filesystem cache failed:'
      )

      // ... including the underlying filesystem error.
      expect(warnings[0].cause).toMatch(/Unable to write SST file/)
      expect(warnings[0].cause).toMatch(/Permission denied/)
    }
  })
})
