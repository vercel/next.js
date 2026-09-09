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
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack additional roots',
  () => {
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
      it('reports initialization warnings when compilation fails', async () => {
        await next.stop()

        await next.patchFile(
          'app/page.tsx',
          (content) => `${content}\nexport const broken =`,
          async () => {
            const { exitCode, cliOutput } = await next.build()
            expect(exitCode).toBe(1)
            expect(cliOutput).toContain('Invalid Turbopack additional root')
          }
        )

        expect((await next.build()).exitCode).toBe(0)
        await next.start({ skipBuild: true })
      })

      it('can rebuild after changing the additional roots config', async () => {
        const browser = await next.browser('/')
        expect(await browser.elementByCss('#value').text()).toBe(
          'linked-initial-/next-plugin'
        )

        await next.stop()

        const updatedExternalRoot = path.resolve(
          next.testDir,
          '../updated-additional-root'
        )
        const updatedLinkedPackage = path.join(
          updatedExternalRoot,
          'packages/linked'
        )
        const link = path.join(next.testDir, 'linked')
        await fs.move(externalRoot, updatedExternalRoot)
        await fs.remove(link)
        await fs.symlink(updatedLinkedPackage, link, 'junction')

        try {
          await next.patchFile(
            'next.config.js',
            (content) => {
              expect(content).toContain('../additional-root')
              return content.replace(
                '../additional-root',
                '../updated-additional-root'
              )
            },
            async () => {
              const { exitCode } = await next.build()
              expect(exitCode).toBe(0)

              await next.start()
              const browser = await next.browser('/')
              expect(await browser.elementByCss('#value').text()).toBe(
                'linked-initial-/next-plugin'
              )
            }
          )
        } finally {
          await next.stop()
          await fs.remove(link)
          await fs.move(updatedExternalRoot, externalRoot)
          await fs.symlink(linkedPackage, link, 'junction')
        }

        expect((await next.build()).exitCode).toBe(0)
      })

      it('emits additional-root files and cross-root symlinks in the NFT', async () => {
        const nft = await fs.readJson(
          path.join(next.testDir, '.next/server/app/page.js.nft.json')
        )
        const rootIndex = nft.additionalRoots.findIndex(
          (root: any) => root.name === 'linkedPackages'
        )
        const root = nft.additionalRoots[rootIndex]

        expect(rootIndex).toBeGreaterThanOrEqual(0)
        expect(root.absolutePath).toBe(await fs.realpath(externalRoot))
        expect(nft.fileHashes).toHaveLength(nft.files.length)
        expect(root.fileHashes).toHaveLength(root.files.length)
        expect(root.symlinks).toEqual([])
        expect(
          root.files.some((file: string) =>
            file.endsWith('node_modules/sibling/index.js')
          )
        ).toBe(true)
        expect(
          nft.symlinks.some(
            (symlink: [number, string, number?]) =>
              symlink.length === 3 && symlink[2] === rootIndex
          )
        ).toBe(true)
      })

      it('runs after relocating standalone output away from the source root', async () => {
        await next.stop()
        const standaloneDirectory = await fs.mkdtemp(
          path.join(os.tmpdir(), 'next-additional-roots-')
        )
        let server: any

        try {
          await fs.remove(standaloneDirectory)
          await fs.move(
            path.join(next.testDir, '.next/standalone'),
            standaloneDirectory
          )
          await fs.remove(externalRoot)

          const stagedRoot = path.join(
            standaloneDirectory,
            'nextAdditionalRoots',
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
          const linkName = (await fs.readdir(nodeModulesDirectory)).find(
            (name) => name.startsWith('sibling-')
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
          await fs.remove(standaloneDirectory)
        }
      })
    }
  }
)
