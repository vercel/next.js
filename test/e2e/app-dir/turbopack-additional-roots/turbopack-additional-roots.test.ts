import { isNextStart, nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import path from 'path'
import { retry } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack additional roots',
  () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      subDir: 'project',
      nextConfig: {
        turbopack: {
          additionalRoots: {
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
      })
    }
  }
)
