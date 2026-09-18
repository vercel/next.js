import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  mapNftFileEntries,
  type NftJson,
} from '../../../packages/next/src/build/nft'
import { createAdapterSyntheticSymlinkDirectory } from '../../../packages/next/src/build/adapter/synthetic-symlinks'

describe('adapter synthetic symlinks', () => {
  describe('mapNftFileEntries', () => {
    it('marks only symlinks whose tuple specifies another root', () => {
      const traceFilePath = path.join(
        path.parse(process.cwd()).root,
        'repo',
        '.next',
        'server',
        'page.js.nft.json'
      )
      const repoRoot = path.join(path.parse(traceFilePath).root, 'repo')
      const nft: NftJson = {
        version: 1,
        files: ['same-root-link', 'root-zero-link', 'base-root-link'],
        symlinks: [
          [0, 'same-root-target'],
          [1, 'root-zero-target', 0],
          [2, 'base-root-target', -1],
        ],
        additionalRoots: [
          {
            name: 'root-zero',
            path: '../../../external',
            files: [],
            symlinks: [],
          },
        ],
      }

      const [sameRoot, rootZero, baseRoot] = mapNftFileEntries(
        nft,
        traceFilePath,
        repoRoot
      )

      expect(sameRoot).toEqual(
        expect.objectContaining({
          symlinkTarget: path.join('.next', 'server', 'same-root-target'),
        })
      )
      expect(sameRoot).not.toHaveProperty('symlinkCrossesRoot')

      expect(rootZero).toEqual(
        expect.objectContaining({
          symlinkTarget: path.join(
            'next_additional_roots',
            'root-zero',
            'root-zero-target'
          ),
          symlinkCrossesRoot: true,
        })
      )
      expect(baseRoot).toEqual(
        expect.objectContaining({
          symlinkTarget: path.join('.next', 'server', 'base-root-target'),
          symlinkCrossesRoot: true,
        })
      )
    })
  })

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
      const first = manager.stage(source, linkTarget, targetHash)
      const second = manager.stage(
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
