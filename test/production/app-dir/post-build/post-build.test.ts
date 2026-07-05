import { nextTestSetup, isNextStart } from 'e2e-utils'
import { existsSync } from 'fs'
import path from 'path'

describe('post-build', () => {
  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_USE_POST_BUILD: '1',
    },
  })

  if (skipped) return

  it('should run post-build compaction on the turbopack cache', async () => {
    if (!isTurbopack) {
      console.log('Skipping: turbopack-only test')
      return
    }

    // Build with NEXT_USE_POST_BUILD=1 which skips compaction during build
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const cachePath = path.join(next.testDir, '.next', 'cache', 'turbopack')
    expect(existsSync(cachePath)).toBe(true)

    // Run `next internal post-build` to compact the database
    const result = await next.runCommand(['internal', 'post-build'])

    if (result.exitCode !== 0) {
      console.log('post-build stdout:', result.stdout)
      console.log('post-build stderr:', result.stderr)
    }
    expect(result.exitCode).toBe(0)
    expect(result.cliOutput).toContain(
      'Turbopack database compaction complete.'
    )
  })

  it('should report nothing to do when persistent caching is disabled', async () => {
    // Override config to disable persistent caching
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: {
          turbopackFileSystemCacheForBuild: false,
        },
      }`
    )

    try {
      const result = await next.runCommand(['internal', 'post-build'])
      expect(result.exitCode).toBe(0)
      expect(result.cliOutput).toContain('Nothing to do.')
    } finally {
      // Restore original config
      await next.patchFile(
        'next.config.js',
        `/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForBuild: true,
  },
}

module.exports = nextConfig`
      )
    }
  })
})
