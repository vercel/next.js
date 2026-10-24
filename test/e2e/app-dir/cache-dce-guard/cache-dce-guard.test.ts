import { nextTestSetup } from 'e2e-utils'

describe('cache-dce-guard', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (isNextDev || skipped || isTurbopack) {
    it.skip('only testable in webpack production (non-deployment)', () => {})
    return
  }

  it('should keep server-only cache modules out of browser chunks', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    // Read all sourcemaps from browser chunks and extract their source paths.
    const sourcemaps = await next.readFiles('.next/static/chunks', (filename) =>
      filename.endsWith('.js.map')
    )
    const sources = sourcemaps.flatMap(
      (sourcemap) => JSON.parse(sourcemap).sources as string[]
    )

    // These server-only modules must NOT appear in any browser chunk.
    const serverLeaks = sources.filter(
      (source) =>
        source.includes('spec-extension/unstable-cache') ||
        source.includes('work-async-storage') ||
        source.includes('incremental-cache') ||
        source.includes('use-cache/cache-life') ||
        source.includes('use-cache/cache-tag') ||
        source.includes('spec-extension/revalidate')
    )

    if (serverLeaks.length > 0) {
      throw new Error(
        `Server-only cache modules leaked into browser chunks:\n  ${serverLeaks.join('\n  ')}\n` +
          'The cache.js DCE guard may be broken.'
      )
    }
  })
})
