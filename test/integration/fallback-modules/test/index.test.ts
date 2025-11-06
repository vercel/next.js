/* eslint-env jest */

import { remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import { join } from 'path'
import { readFileSync, statSync } from 'fs'

const fixturesDir = join(__dirname, '..', 'fixtures')

describe('Fallback Modules', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('Crypto Application', () => {
        const appDir = join(fixturesDir, 'with-crypto')

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        it('should not include crypto', async () => {
          if (process.env.NEXT_PRIVATE_SKIP_SIZE_TESTS) {
            return
          }

          await nextBuild(appDir, [], {
            stdout: true,
          })

          // Read build manifest to get chunk files for the index page
          const buildManifestPath = join(appDir, '.next', 'build-manifest.json')
          const buildManifest = JSON.parse(
            readFileSync(buildManifestPath, 'utf8')
          )

          // Get chunks for the '/' page
          const indexPageChunks = buildManifest.pages['/'] || []

          // Calculate total size of all chunks for the index page
          let totalSize = 0
          for (const chunkPath of indexPageChunks) {
            const fullChunkPath = join(appDir, '.next', chunkPath)
            try {
              const stats = statSync(fullChunkPath)
              totalSize += stats.size
            } catch (error) {
              console.warn(`Could not read chunk: ${chunkPath}`, error.message)
            }
          }

          // Convert to kB for easier comparison
          const totalSizeKB = totalSize / 1024

          console.log(`Index page total size: ${totalSizeKB.toFixed(2)} kB`)
          console.log(`Index page chunks: ${indexPageChunks.join(', ')}`)

          // Assert on reasonable size bounds
          // The total should be reasonable for a simple page without crypto
          expect(totalSizeKB).toBeGreaterThan(10) // At least 10kB (has some framework code)
          expect(totalSizeKB).toBeLessThan(400) // Less than 400kB (no large crypto libraries)

          // Ensure we have the expected chunks
          expect(indexPageChunks.length).toBeGreaterThan(0)
        })
      })
    }
  )
})
