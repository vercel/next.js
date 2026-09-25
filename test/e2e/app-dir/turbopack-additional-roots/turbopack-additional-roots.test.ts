import crypto from 'crypto'
import execa from 'execa'
import { isNextDeploy, isNextStart, nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import type { NextAdapter } from 'next'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'

// Non-adapter deploys do not exercise Next.js' adapter asset contract.
// @force-gate turbopack && (!deploy || adapter)
describe('turbopack additional roots', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    subDir: 'project',
    packageJson: {
      scripts: {
        prebuild: 'node prepare-deploy-additional-root.mjs',
      },
    },
    env: {
      ...(isNextStart && { NEXT_TEST_CAPTURE_ADAPTER: '1' }),
    },
    skipStart: true,
  })

  let externalRoot: string | undefined

  beforeAll(async () => {
    if (!isNextDeploy) {
      const result = await execa(
        'node',
        ['prepare-deploy-additional-root.mjs'],
        {
          cwd: next.testDir,
        }
      )
      externalRoot = result.stdout
    }

    await next.start()
  })

  afterAll(async () => {
    try {
      await next.stop()
    } finally {
      if (!isNextDeploy && externalRoot) {
        await fs.remove(externalRoot)
      }
    }
  })

  it('resolves a linked package, sibling dependency, and next/dist', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#value').text()).toBe(
      'linked-initial-/next-plugin'
    )
  })

  it('reports initialization warnings when startup succeeds', () => {
    expect(next.cliOutput).toContain('Invalid Turbopack additional root')
    expect(next.cliOutput).not.toContain('overlaps the project root')
  })

  if (isNextDev) {
    it('tracks updates in an additional root', async () => {
      const browser = await next.browser('/')

      await next.patchFile(
        path.relative(
          next.testDir,
          path.join(externalRoot!, 'packages/linked/index.js')
        ),
        (content) => content.replace('linked-', 'updated-'),
        async () => {
          await retry(async () => {
            expect(await browser.elementByCss('#value').text()).toBe(
              'updated-initial-/next-plugin'
            )
          })
        }
      )
    })
  }

  if (isNextStart) {
    it('emits additional-root files and cross-root symlinks in the NFT', async () => {
      const nftPath = path.join(
        next.testDir,
        '.next/server/app/page.js.nft.json'
      )
      const nft = await fs.readJson(nftPath)
      expect(
        path.resolve(path.dirname(nftPath), nft.additionalRoots[0].path)
      ).toBe(externalRoot)
      const crossRootSymlinks = nft.symlinks
        .filter((symlink: [number, string, number?]) => symlink.length === 3)
        .map(
          ([fileIndex, target, additionalRootIndex]: [
            number,
            string,
            number,
          ]) => ({
            file: nft.files[fileIndex],
            target,
            additionalRoot: nft.additionalRoots[additionalRootIndex].name,
          })
        )
      const additionalRoots = nft.additionalRoots.map((root: any) => {
        const copy = { ...root }
        delete copy.fileHashes
        copy.path = '<temporary-root>'
        return copy
      })

      expect(crossRootSymlinks).toMatchInlineSnapshot(`
       [
         {
           "additionalRoot": "linkedPackages",
           "file": "../../node_modules/sibling-639f6b1f4617eee0",
           "target": "node_modules/sibling",
         },
       ]
      `)
      expect(additionalRoots).toMatchInlineSnapshot(`
       [
         {
           "files": [
             "node_modules/sibling/index.js",
             "node_modules/sibling/package.json",
           ],
           "name": "linkedPackages",
           "path": "<temporary-root>",
           "symlinks": [],
         },
       ]
      `)
    })

    it('provides relocatable synthetic symlinks through adapter assets', async () => {
      const buildComplete: Parameters<
        NonNullable<NextAdapter['onBuildComplete']>
      >[0] = await next.readJSON('build-complete.json')
      const rootOutput = buildComplete.outputs.appPages.find(
        (output) => output.pathname === '/'
      )
      expect(rootOutput).toBeDefined()
      expect(rootOutput).not.toHaveProperty('assetSymlinks')

      const crossRootAsset = Object.entries(rootOutput!.assets).find(
        ([destination]) => path.basename(destination).startsWith('sibling-')
      )
      expect(crossRootAsset).toBeDefined()

      const [destination, source] = crossRootAsset!
      const stagingRoot = path.join(
        buildComplete.distDir,
        'adapter',
        'synthetic_symlinks'
      )
      expect(path.dirname(source)).toBe(stagingRoot)
      expect(path.basename(source)).toMatch(/^[0-9a-f]{32}$/)
      expect((await fs.lstat(source)).isSymbolicLink()).toBe(true)

      const target = path.join(
        'next_additional_roots',
        'linkedPackages',
        'node_modules',
        'sibling'
      )
      const expectedPayload = path.relative(path.dirname(destination), target)
      expect(await fs.readlink(source)).toBe(expectedPayload)
      expect(
        path.normalize(path.join(path.dirname(destination), expectedPayload))
      ).toBe(target)

      const expectedHash = crypto
        .createHash('sha256')
        .update('adapter-symlink-test')
        .update('link')
        .update(expectedPayload)
        .digest('hex')
      expect(rootOutput!.assetsHashes[destination]).toBe(expectedHash)

      const nft = await fs.readJson(
        path.join(next.testDir, '.next/server/app/page.js.nft.json')
      )
      const [sourceFileIndex] = nft.symlinks.find(
        (symlink: [number, string, number?]) => symlink.length === 3
      )
      expect(rootOutput!.assetsHashes[destination]).not.toBe(
        nft.fileHashes[sourceFileIndex]
      )

      const instrumentationNft = await fs.readJson(
        path.join(next.testDir, '.next/server/instrumentation.js.nft.json')
      )
      expect(
        instrumentationNft.symlinks.some(
          (symlink: [number, string, number?]) => symlink.length === 3
        )
      ).toBe(true)
      expect(await fs.readdir(stagingRoot)).toEqual([path.basename(source)])

      const equivalentSources = buildComplete.outputs.appPages
        .map((output) => output.assets[destination])
        .filter(Boolean)
      expect(equivalentSources.length).toBeGreaterThan(1)
      expect(new Set(equivalentSources)).toEqual(new Set([source]))
    })

    it('runs after relocating standalone output away from the source root', async () => {
      await next.stop()
      const syntheticSymlinkRoot = path.join(
        next.testDir,
        '.next/adapter/synthetic_symlinks'
      )
      await fs.remove(syntheticSymlinkRoot)
      delete next.env.NEXT_TEST_CAPTURE_ADAPTER
      expect((await next.build()).exitCode).toBe(0)
      expect(await fs.pathExists(syntheticSymlinkRoot)).toBe(false)

      const temporaryDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'next-additional-roots-')
      )
      const standaloneDirectory = path.join(temporaryDirectory, 'standalone')
      let server: any

      try {
        await fs.move(
          path.join(next.testDir, '.next/standalone'),
          standaloneDirectory
        )
        await fs.remove(externalRoot)

        const stagedRoot = path.join(
          standaloneDirectory,
          'next_additional_roots',
          'linkedPackages'
        )
        expect(
          await fs.pathExists(
            path.join(stagedRoot, 'node_modules/sibling/index.js')
          )
        ).toBe(true)

        const nodeModulesDirectory = path.join(
          standaloneDirectory,
          '.next/node_modules'
        )
        const linkName = (await fs.readdir(nodeModulesDirectory)).find((name) =>
          name.startsWith('sibling-')
        )
        expect(linkName).toBeDefined()
        const linkPath = path.join(nodeModulesDirectory, linkName!)
        const linkTarget = await fs.readlink(linkPath)
        expect(path.isAbsolute(linkTarget)).toBe(false)
        expect(path.resolve(nodeModulesDirectory, linkTarget)).toBe(
          path.join(stagedRoot, 'node_modules/sibling')
        )

        const appPort = await findPort()
        server = await initNextServerScript(
          path.join(standaloneDirectory, 'server.js'),
          /- Local:/,
          {
            ...process.env,
            ...next.env,
            PORT: appPort.toString(),
          },
          undefined,
          { cwd: standaloneDirectory }
        )
        const response = await fetchViaHTTP(appPort, '/')
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('linked-initial-/next-plugin')
      } finally {
        if (server) await killApp(server)
        await fs.remove(temporaryDirectory)
      }
    })
  }
})
