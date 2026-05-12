import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Fallback Modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      seedrandom: 'latest',
    },
  })

  it('should not include crypto', async () => {
    if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
      return
    }

    await next.build()

    const buildManifestPath = join(next.testDir, '.next', 'build-manifest.json')
    const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'))

    const indexPageChunks = buildManifest.pages['/'] || []

    let totalSize = 0
    for (const chunkPath of indexPageChunks) {
      const fullChunkPath = join(next.testDir, '.next', chunkPath)
      try {
        const stats = statSync(fullChunkPath)
        totalSize += stats.size
      } catch {
        // chunk may not exist
      }
    }

    const totalSizeKB = totalSize / 1024

    expect(totalSizeKB).toBeGreaterThan(10)
    expect(totalSizeKB).toBeLessThan(400)
    expect(indexPageChunks.length).toBeGreaterThan(0)
  })
})
