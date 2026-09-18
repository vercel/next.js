import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  mapNftFileEntries,
  type NftJson,
} from '../../../packages/next/src/build/nft'
import {
  createSyntheticSymlinkManager,
  SyntheticSymlinkManager,
} from '../../../packages/next/src/build/adapter/synthetic-symlinks'

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

  describe('SyntheticSymlinkManager', () => {
    let testDirectory: string

    beforeEach(async () => {
      testDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'next-adapter-symlinks-')
      )
    })

    afterEach(async () => {
      await fs.rm(testDirectory, { recursive: true, force: true })
    })

    if (process.platform !== 'win32') {
      it('cleans stale staging lazily and reuses the expected MD5 path', async () => {
        const distDir = path.join(testDirectory, '.next')
        const stagingRoot = path.join(distDir, 'adapter', 'synthetic-symlinks')
        await fs.mkdir(stagingRoot, { recursive: true })
        await fs.writeFile(path.join(stagingRoot, 'stale'), 'stale')

        const stat = jest.fn()
        const manager = await createSyntheticSymlinkManager(distDir, {
          platform: 'linux',
          stat: stat as unknown as typeof fs.stat,
        })
        await expect(fs.access(stagingRoot)).rejects.toMatchObject({
          code: 'ENOENT',
        })

        const entry = {
          source: path.join(testDirectory, 'source-link'),
          destination: path.join('functions', 'app', 'node_modules', 'pkg'),
          symlinkTarget: path.join('next_additional_roots', 'packages', 'pkg'),
        }
        const relativeTarget = path.relative(
          path.dirname(entry.destination),
          entry.symlinkTarget
        )
        const expectedName = crypto
          .createHash('md5')
          .update(relativeTarget)
          .digest('hex')

        const [first, second] = await Promise.all([
          manager.stage(entry),
          manager.stage({
            ...entry,
            source: path.join(testDirectory, 'equivalent-source-link'),
          }),
        ])

        expect(first).toBe(path.join(stagingRoot, expectedName))
        expect(second).toBe(first)
        expect(path.basename(first)).toHaveLength(32)
        expect(await fs.readlink(first)).toBe(relativeTarget)
        expect(stat).not.toHaveBeenCalled()
      })

      it('distinguishes payloads required at different destination depths', async () => {
        const manager = new SyntheticSymlinkManager(
          path.join(testDirectory, 'staging'),
          'linux'
        )
        const common = {
          source: path.join(testDirectory, 'source-link'),
          symlinkTarget: path.join('roots', 'packages', 'pkg'),
        }

        const shallow = await manager.stage({
          ...common,
          destination: path.join('functions', 'pkg'),
        })
        const deep = await manager.stage({
          ...common,
          destination: path.join('functions', 'nested', 'pkg'),
        })

        expect(shallow).not.toBe(deep)
        expect(await fs.readlink(shallow)).not.toBe(await fs.readlink(deep))
      })

      it('creates a link that remains valid after a verbatim copy', async () => {
        const manager = new SyntheticSymlinkManager(
          path.join(testDirectory, 'staging'),
          'linux'
        )
        const destination = path.join('functions', 'node_modules', 'pkg')
        const symlinkTarget = path.join('roots', 'packages', 'pkg')
        const stagedPath = await manager.stage({
          source: path.join(testDirectory, 'source-link'),
          destination,
          symlinkTarget,
        })

        const deploymentRoot = path.join(testDirectory, 'deployment')
        const deployedTarget = path.join(deploymentRoot, symlinkTarget)
        await fs.mkdir(deployedTarget, { recursive: true })
        await fs.writeFile(path.join(deployedTarget, 'value.txt'), 'copied')

        const deployedLink = path.join(deploymentRoot, destination)
        await fs.mkdir(path.dirname(deployedLink), { recursive: true })
        await fs.cp(stagedPath, deployedLink, {
          recursive: true,
          verbatimSymlinks: true,
        })

        expect(await fs.readlink(deployedLink)).toBe(
          path.relative(path.dirname(destination), symlinkTarget)
        )
        expect(
          await fs.readFile(path.join(deployedLink, 'value.txt'), 'utf8')
        ).toBe('copied')
      })

      it('includes the Windows target type in the cache key', async () => {
        const stagingRoot = path.join(testDirectory, 'staging')
        const stat = jest.fn(async (source: string) => ({
          isDirectory: () => source.endsWith('directory'),
        })) as unknown as typeof fs.stat
        const manager = new SyntheticSymlinkManager(stagingRoot, 'win32', stat)
        const common = {
          destination: path.join('functions', 'pkg'),
          symlinkTarget: path.join('roots', 'pkg'),
        }
        const relativeTarget = path.relative(
          path.dirname(common.destination),
          common.symlinkTarget
        )

        const fileLink = await manager.stage({
          ...common,
          source: path.join(testDirectory, 'file'),
        })
        const directoryLink = await manager.stage({
          ...common,
          source: path.join(testDirectory, 'directory'),
        })

        expect(path.basename(fileLink)).toBe(
          crypto
            .createHash('md5')
            .update(`file\0${relativeTarget}`)
            .digest('hex')
        )
        expect(path.basename(directoryLink)).toBe(
          crypto
            .createHash('md5')
            .update(`dir\0${relativeTarget}`)
            .digest('hex')
        )
        expect(fileLink).not.toBe(directoryLink)
      })

      it('treats unresolved Windows targets as files and propagates other errors', async () => {
        const entry = {
          source: path.join(testDirectory, 'source-link'),
          destination: path.join('functions', 'pkg'),
          symlinkTarget: path.join('roots', 'pkg'),
        }
        const relativeTarget = path.relative(
          path.dirname(entry.destination),
          entry.symlinkTarget
        )

        for (const code of ['ENOENT', 'ELOOP']) {
          const stat = jest.fn(async () => {
            throw Object.assign(new Error(code), { code })
          }) as unknown as typeof fs.stat
          const manager = new SyntheticSymlinkManager(
            path.join(testDirectory, code),
            'win32',
            stat
          )

          const stagedPath = await manager.stage(entry)
          expect(path.basename(stagedPath)).toBe(
            crypto
              .createHash('md5')
              .update(`file\0${relativeTarget}`)
              .digest('hex')
          )
        }

        const error = Object.assign(new Error('denied'), { code: 'EACCES' })
        const manager = new SyntheticSymlinkManager(
          path.join(testDirectory, 'denied'),
          'win32',
          jest.fn(async () => {
            throw error
          }) as unknown as typeof fs.stat
        )
        await expect(manager.stage(entry)).rejects.toBe(error)
      })
    }
  })
})
