import { isNextStart, nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'

// Deploy only uploads `project`, but this suite intentionally uses a sibling filesystem root.
//
// @force-gate turbopack && !deploy
describe('turbopack additional roots', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    subDir: 'project',
    nextConfig: {
      output: 'standalone',
      serverExternalPackages: ['sibling'],
      experimental: {
        turbopackAdditionalRoots: {
          linkedPackages: { path: '../additional-root' },
          missingOptional: {
            path: './missing-optional-root',
            ignoreIfMissing: false,
          },
        },
      },
    },
    skipStart: true,
  })

  let externalRoot: string
  let linkedPackage: string

  beforeAll(async () => {
    externalRoot = path.resolve(next.testDir, '../additional-root')
    linkedPackage = path.join(externalRoot, 'packages/linked')

    await fs.copy(
      path.join(__dirname, 'fixtures/additional-root'),
      externalRoot
    )

    await fs.symlink(
      linkedPackage,
      path.join(next.testDir, 'linked'),
      'junction' // use a junction point on windows (this argument is ignored everywhere else)
    )

    await next.start()
  })

  afterAll(async () => {
    await next.stop()
    await fs.remove(externalRoot)
  })

  it('resolves a linked package, sibling dependency, and next/dist', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#value').text()).toBe(
      'linked-initial-/next-plugin'
    )
  })

  it('reports initialization warnings when startup succeeds', () => {
    expect(next.cliOutput).toContain('Invalid Turbopack additional root')
  })

  if (isNextDev) {
    it('tracks updates in an additional root', async () => {
      const browser = await next.browser('/')

      await next.patchFile(
        '../additional-root/packages/linked/index.js',
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
           "path": "../../../../additional-root",
           "symlinks": [],
         },
       ]
      `)
    })

    it('runs after relocating standalone output away from the source root', async () => {
      await next.stop()
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
