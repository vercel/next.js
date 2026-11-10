import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createAdapterSyntheticSymlinkDirectory } from './synthetic-symlinks'

describe('adapter synthetic symlinks', () => {
  // @force-gate !windows
  describe('SyntheticSymlinkManager', () => {
    let testDirectory: string

    beforeEach(async () => {
      testDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'next-adapter-symlinks-')
      )
    })

    afterEach(async () => {
      await fs.rm(testDirectory, {
        recursive: true,
        force: true,
        maxRetries: 3,
      })
    })

    it('cleans stale staging and reuses the staged path', async () => {
      const distDir = path.join(testDirectory, '.next')
      const stagingRoot = path.join(distDir, 'adapter', 'synthetic_symlinks')
      const staleFile = path.join(stagingRoot, 'stale')
      await fs.mkdir(stagingRoot, { recursive: true })
      await fs.writeFile(staleFile, 'stale')

      const manager = createAdapterSyntheticSymlinkDirectory(distDir)
      await expect(fs.access(staleFile)).rejects.toMatchObject({
        code: 'ENOENT',
      })

      const source = path.join(testDirectory, 'source-link')
      const linkTarget = path.relative(
        path.join('functions', 'app', 'node_modules'),
        path.join('next_additional_roots', 'packages', 'pkg')
      )
      const targetHash = 'a'.repeat(64)
      const first = manager.createLink(source, linkTarget, targetHash)
      const second = manager.createLink(
        path.join(testDirectory, 'equivalent-source-link'),
        linkTarget,
        targetHash
      )

      expect(path.dirname(first)).toBe(stagingRoot)
      expect(path.basename(first)).toBe('a'.repeat(32))
      expect(second).toBe(first)
      expect(await fs.readlink(first)).toBe(linkTarget)
    })
  })
})
