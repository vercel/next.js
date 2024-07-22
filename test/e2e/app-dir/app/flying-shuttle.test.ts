import fs from 'fs'
import path from 'path'
import type { Route } from 'playwright'
import { retry } from 'next-test-utils'
import { nextTestSetup, isNextStart } from 'e2e-utils'

// This feature is only relevant to Webpack.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'should output updated trace files',
  () => {
    if (!isNextStart) {
      it('should skip for non-next start', () => {})
      return
    }

    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        nanoid: '4.0.1',
      },
      env: {
        NEXT_PRIVATE_FLYING_SHUTTLE: 'true',
      },
    })

    it('should have file hashes in trace files', async () => {
      const deploymentsTracePath = path.join(
        next.testDir,
        '.next/server/app/dashboard/deployments/[id]/page.js.nft.json'
      )
      const deploymentsTrace = JSON.parse(
        await fs.promises.readFile(deploymentsTracePath, 'utf8')
      )
      const ssgTracePath = path.join(
        next.testDir,
        '.next/server/pages/ssg.js.nft.json'
      )
      const ssgTrace = JSON.parse(
        await fs.promises.readFile(ssgTracePath, 'utf8')
      )

      expect(deploymentsTrace.fileHashes).toBeTruthy()

      const deploymentsFileHashKeys = Object.keys(deploymentsTrace.fileHashes)
      // ensure the 3 related layouts are included, root, dashboard,
      // and deployments
      expect(
        deploymentsFileHashKeys.filter((item) => item.includes('/layout'))
          .length
      ).toBe(3)

      expect(ssgTrace.fileHashes).toBeTruthy()

      // ensure all files have corresponding fileHashes
      for (const [traceFile, traceFilePath] of [
        [deploymentsTrace, deploymentsTracePath],
        [ssgTrace, ssgTracePath],
      ]) {
        for (const key of traceFile.files) {
          const absoluteKey = path.join(path.dirname(traceFilePath), key)
          const stats = await fs.promises.stat(absoluteKey)

          if (
            stats.isSymbolicLink() ||
            stats.isDirectory() ||
            absoluteKey.startsWith(path.join(next.testDir, '.next'))
          ) {
            continue
          }

          expect(typeof traceFile.fileHashes[key]).toBe('string')
        }
      }
    })

    it('should hard navigate on chunk load failure', async () => {
      let blockChunks = false
      const browser = await next.browser('/dashboard', {
        beforePageLoad(page) {
          page.route('**/_next/static/**', async (route: Route) => {
            if (blockChunks) {
              return route.abort()
            }
            return route.continue()
          })
        },
      })

      await retry(async () => {
        expect(await browser.eval('!!next.router.push')).toBe(true)
      })
      blockChunks = true
      await browser.eval('window.beforeNav = 1')
      await browser.eval('next.router.push("/dynamic-client/first/second")')

      await retry(async () => {
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toContain('button on app/dynamic-client')
      })
      // since we hard navigate on failure global scope should be cleared
      expect(await browser.eval('window.beforeNav')).toBeFalsy()
    })

    async function checkAppPagesNavigation() {
      const testPaths = [
        { path: '/', content: 'hello from pages/index', type: 'pages' },
        {
          path: '/blog/123',
          content: 'hello from pages/blog/[slug]',
          type: 'pages',
        },
        {
          path: '/dynamic-client/first/second',
          content: 'button on app/dynamic-client',
          type: 'app',
        },
        {
          path: '/dashboard',
          content: 'hello from app/dashboard',
          type: 'app',
        },
        {
          path: '/dashboard/deployments/123',
          content: 'hello from app/dashboard/deployments/[id]',
          type: 'app',
        },
      ]

      for (const testPath of testPaths) {
        const { path, content } = testPath
        require('console').error('checking', path)

        const res = await next.fetch(path)
        expect(res.status).toBe(200)

        const browser = await next.browser(path)

        await retry(async () => {
          expect(await browser.eval('!!window.next.router')).toBe(true)
          expect(
            await browser.eval('document.documentElement.innerHTML')
          ).toContain(content)
        })

        const checkNav = async (testPath: (typeof testPaths)[0]) => {
          await browser.eval(`window.next.router.push("${testPath.path}")`)

          await retry(async () => {
            expect(await browser.eval('!!window.next.router')).toBe(true)
            expect(
              await browser.eval('document.documentElement.innerHTML')
            ).toContain(testPath.content)
          })
        }

        // test navigating to a pages path
        const pagesTestPath = testPaths.find(
          (item) => item.type === 'pages' && item.path !== path
        )
        await checkNav(pagesTestPath)

        // go back to initial page
        await checkNav(testPath)

        // test navigating to an app route
        const appTestPath = testPaths.find(
          (item) => item.type === 'app' && item.path !== path
        )
        await checkNav(appTestPath)
      }
    }

    it('should only rebuild just a changed app route correctly', async () => {
      await next.stop()

      const dataPath = 'app/dashboard/deployments/[id]/data.json'
      const originalContent = await next.readFile(dataPath)

      try {
        await next.patchFile(dataPath, JSON.stringify({ hello: 'again' }))
        await next.start()

        await checkAppPagesNavigation()
      } finally {
        await next.patchFile(dataPath, originalContent)
      }
    })

    it('should only rebuild just a changed pages route correctly', async () => {
      await next.stop()

      const pagePath = 'pages/index.js'
      const originalContent = await next.readFile(pagePath)

      try {
        await next.patchFile(
          pagePath,
          originalContent.replace(
            'hello from pages/index',
            'hello from pages/index!!'
          )
        )
        await next.start()

        await checkAppPagesNavigation()
      } finally {
        await next.patchFile(pagePath, originalContent)
      }
    })

    it('should only rebuild a changed app and pages route correctly', async () => {
      await next.stop()

      const pagePath = 'pages/index.js'
      const originalPageContent = await next.readFile(pagePath)
      const dataPath = 'app/dashboard/deployments/[id]/data.json'
      const originalDataContent = await next.readFile(dataPath)

      try {
        await next.patchFile(
          pagePath,
          originalPageContent.replace(
            'hello from pages/index',
            'hello from pages/index!!'
          )
        )
        await next.patchFile(dataPath, JSON.stringify({ hello: 'again' }))
        await next.start()

        await checkAppPagesNavigation()
      } finally {
        await next.patchFile(pagePath, originalPageContent)
        await next.patchFile(dataPath, originalDataContent)
      }
    })
  }
)
