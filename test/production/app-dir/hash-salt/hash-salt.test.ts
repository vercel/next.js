import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdir } from 'fs/promises'

async function getChunkFilenames(dir: string): Promise<string[]> {
  const entries: string[] = []
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true })
    for (const entry of dirEntries) {
      if (!entry.isDirectory() && entry.name.endsWith('.js')) {
        entries.push(entry.name)
      }
    }
  } catch {
    // directory may not exist
  }
  return entries
}

describe('hash-salt', () => {
  describe('with different salts', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    let saltAChunks: string[] = []
    let saltBChunks: string[] = []

    beforeAll(async () => {
      const chunksDir = join(next.testDir, '.next/static/chunks')

      // Build with salt "salt-a"
      await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
      saltAChunks = await getChunkFilenames(chunksDir)

      // Rebuild with salt "salt-b"
      await next.clean()
      await next.build({ env: { NEXT_HASH_SALT: 'salt-b' } })
      saltBChunks = await getChunkFilenames(chunksDir)
    })

    it('should produce chunk files', () => {
      expect(saltAChunks.length).toBeGreaterThan(0)
      expect(saltBChunks.length).toBeGreaterThan(0)
    })

    it('should produce different chunk hashes when NEXT_HASH_SALT changes', () => {
      // With different salts, the content-hashed chunk filenames should differ
      expect(saltAChunks.sort()).not.toEqual(saltBChunks.sort())
    })
  })

  describe('with same salt', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    let firstBuildChunks: string[] = []
    let secondBuildChunks: string[] = []

    beforeAll(async () => {
      const chunksDir = join(next.testDir, '.next/static/chunks')

      // Build with salt "salt-a"
      await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
      firstBuildChunks = await getChunkFilenames(chunksDir)

      // Rebuild with the same salt
      await next.clean()
      await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
      secondBuildChunks = await getChunkFilenames(chunksDir)
    })

    it('should produce chunk files', () => {
      expect(firstBuildChunks.length).toBeGreaterThan(0)
    })

    it('should produce identical chunk hashes when NEXT_HASH_SALT is the same', () => {
      // Same salt should produce same hashes
      expect(firstBuildChunks.sort()).toEqual(secondBuildChunks.sort())
    })
  })
})
