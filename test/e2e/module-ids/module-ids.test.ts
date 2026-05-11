import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

describe('minified module ids', () => {
  ;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode',
    () => {
      const { next, isNextStart } = nextTestSetup({
        files: __dirname,
      })
      if (!isNextStart) {
        it('skipped for non-start mode', () => {})
        return
      }

      let ssrBundles = ''
      let staticBundles = ''

      beforeAll(async () => {
        const distDir = path.join(next.testDir, next.distDir)
        const ssrPath = path.join(distDir, 'server/chunks/ssr/')
        const ssrBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
          p.match(/\.js$/)
        )
        for (const basename of ssrBundleBasenames) {
          const output = await fs.readFile(path.join(ssrPath, basename), 'utf8')
          ssrBundles += output
        }

        const staticBundleBasenames = (await listClientChunks(distDir)).filter(
          (p) => p.endsWith('.js')
        )
        for (const basename of staticBundleBasenames) {
          const output = await fs.readFile(path.join(distDir, basename), 'utf8')
          staticBundles += output
        }
      })

      it('should have no long module ids for basic modules', async () => {
        expect(ssrBundles).not.toContain('module-with-long-name')
        expect(ssrBundles).toContain('the content of a module with a long name')
      })

      it('should have no long module ids for external modules', async () => {
        expect(ssrBundles).not.toContain('external-module-with-long-name')
        expect(ssrBundles).toContain(
          'the content of an external module with a long name'
        )
      })

      it('should have no long module ids for async loader modules', async () => {
        expect(ssrBundles).not.toContain('CustomComponent.tsx')
        expect(ssrBundles).toContain('the content of a dynamic component')
      })

      it('should have no long module id for the next client runtime module', async () => {
        expect(staticBundles).not.toContain('next/dist/client/next-turbopack')
      })
    }
  )
  ;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'development mode',
    () => {
      const { next, isNextDev } = nextTestSetup({
        files: __dirname,
      })
      if (!isNextDev) {
        it('skipped for non-dev mode', () => {})
        return
      }

      let ssrBundles = ''
      let staticBundles = ''

      beforeAll(async () => {
        await next.render('/')

        const distDir = path.join(next.testDir, next.distDir)
        const ssrPath = path.join(distDir, 'server/chunks/ssr/')
        const ssrBundleBasenames = (await fs.readdir(ssrPath)).filter((p) =>
          p.match(/\.js$/)
        )
        for (const basename of ssrBundleBasenames) {
          const output = await fs.readFile(path.join(ssrPath, basename), 'utf8')
          ssrBundles += output
        }

        const staticBundleBasenames = (await listClientChunks(distDir)).filter(
          (p) => p.endsWith('.js')
        )
        for (const basename of staticBundleBasenames) {
          const output = await fs.readFile(path.join(distDir, basename), 'utf8')
          staticBundles += output
        }
      })

      it('should have long module ids for basic modules', async () => {
        expect(ssrBundles).toContain('module-with-long-name')
        expect(ssrBundles).toContain('the content of a module with a long name')
      })

      it('should have long module ids for external modules', async () => {
        expect(ssrBundles).toContain('external-module-with-long-name')
        expect(ssrBundles).toContain(
          'the content of an external module with a long name'
        )
      })

      it('should have long module ids for async loader modules', async () => {
        expect(ssrBundles).toContain('CustomComponent.tsx')
        expect(ssrBundles).toContain('the content of a dynamic component')
      })

      it('should have long module id for the next client runtime module', async () => {
        expect(staticBundles).toContain('next/dist/client/next-dev-turbopack')
      })
    }
  )
})
