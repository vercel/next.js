import { nextTestSetup } from 'e2e-utils'
import fs from 'fs/promises'
import path from 'path'

// `experimental.turbopackFileSystemCacheForBuild` is enabled by default in all
// environments. It can be disabled explicitly with
// `turbopackFileSystemCacheForBuild: false`.
//
// This is a Turbopack + build (start) mode test. It runs `next build` with
// controlled local and CI environments and checks whether anything is written
// to `.next/cache/turbopack`.
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely mutates files in the isolated local fixture after setup.
// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
describe('filesystem-cache build default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Simulate a non-CI (local) environment by clearing the common CI signals.
  const NON_CI_ENV = {
    CI: '',
    CONTINUOUS_INTEGRATION: '',
    BUILD_NUMBER: '',
    RUN_ID: '',
    GITHUB_ACTIONS: '',
    NOW_BUILDER: '',
    // Persist even a tiny snapshot so the assertion doesn't depend on the
    // minimum-compilation-time threshold.
    TURBO_ENGINE_IGNORE_DIRTY: '1',
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  function cachePath() {
    return path.join(next.testDir, '.next', 'cache', 'turbopack')
  }

  async function getCacheSize(): Promise<number> {
    let entries
    try {
      entries = await fs.readdir(cachePath(), {
        recursive: true,
        withFileTypes: true,
      })
    } catch {
      // Directory doesn't exist -> nothing was cached.
      return 0
    }
    let totalSize = 0
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(entry.parentPath ?? entry.path, entry.name)
        totalSize += (await fs.stat(filePath)).size
      }
    }
    return totalSize
  }

  async function cleanBuildOutput() {
    await fs.rm(path.join(next.testDir, '.next'), {
      recursive: true,
      force: true,
    })
  }

  // The shared fixture's next.config.js sets the flag explicitly from
  // `ENABLE_CACHING`; overwrite it so we exercise the *default* instead.
  async function setConfig(experimental: Record<string, unknown> = {}) {
    await next.patchFile(
      'next.config.js',
      `module.exports = ${JSON.stringify({ experimental }, null, 2)}`
    )
  }

  afterEach(async () => {
    await setConfig()
  })

  it('writes the cache by default (no config, local environment)', async () => {
    await cleanBuildOutput()
    await setConfig()

    const { exitCode } = await next.build({ env: NON_CI_ENV })
    expect(exitCode).toBe(0)

    expect(await getCacheSize()).toBeGreaterThan(0)
  })

  it('writes nothing when turbopackFileSystemCacheForBuild is false', async () => {
    await cleanBuildOutput()
    await setConfig({ turbopackFileSystemCacheForBuild: false })

    const { exitCode } = await next.build({ env: NON_CI_ENV })
    expect(exitCode).toBe(0)

    expect(await getCacheSize()).toBe(0)
  })

  it('writes the cache by default in CI', async () => {
    await cleanBuildOutput()
    await setConfig()

    const { exitCode } = await next.build({
      // Force a generic CI environment.
      env: { ...NON_CI_ENV, CI: '1' },
    })
    expect(exitCode).toBe(0)

    expect(await getCacheSize()).toBeGreaterThan(0)
  })
})
