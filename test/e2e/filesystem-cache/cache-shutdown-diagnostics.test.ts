import { nextTestSetup } from 'e2e-utils'
import fs from 'fs/promises'
import path from 'path'

// Regression test for the Turbopack persistent build cache: when cache
// maintenance (persisting/compaction) fails while shutting down — e.g. because
// the cache directory cannot be written to anymore (full disk, read-only
// directory) — `next build` keeps reporting success while printing a bare,
// Display-formatted `Shutting down failed: <message>` line into the regular
// build output. That line carries no cause chain, so the underlying
// filesystem error is never shown, and it is repeated on every later build.
//
// This asserts the *current* behavior, which is reported as unactionable.
//
// The failure is injected by making the versioned database directory
// read-only, which only has an effect for a regular (non-root) user on a
// POSIX filesystem.
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It mutates files in the isolated local fixture after setup.
// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
// @force-gate linux
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
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  function cachePath() {
    return path.join(next.testDir, '.next', 'cache', 'turbopack')
  }

  // The database lives in a `v<version>-<hash>` subdirectory of the cache.
  async function databasePath() {
    const entries = await fs.readdir(cachePath(), { withFileTypes: true })
    const dir = entries.find((entry) => entry.isDirectory())
    expect(dir).toBeDefined()
    return path.join(cachePath(), dir!.name)
  }

  function shutdownLines(cliOutput: string) {
    return cliOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Shutting down failed:'))
  }

  it('reports a successful build while printing an unactionable cache shutdown failure on every build', async () => {
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
    expect(shutdownLines(first.cliOutput)).toEqual([])

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

      // ... while the cache maintenance failure is printed exactly once as a
      // plain line of build output (no `⚠`/`Warning:` prefix).
      const lines = shutdownLines(build.cliOutput)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/^Shutting down failed: /)

      // The message is Display-formatted, so the underlying filesystem error
      // that caused it is dropped and never shown to the user.
      expect(lines[0]).not.toMatch(/Permission denied|os error|Caused by/)
    }
  })
})
