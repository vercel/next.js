import path from 'path'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir - server components externals',
  {
    files: __dirname,
  },
  ({ next, isTurbopack }) => {
    it('should have externals for those in config.experimental.serverComponentsExternalPackages', async () => {
      const $ = await next.render$('/')

      const text = $('#directory').text()
      expect(text).toBe(
        path.join(next.testDir, 'node_modules', 'external-package')
      )
    })

    it('uses externals for predefined list in server-external-packages.json', async () => {
      const $ = await next.render$('/predefined')

      const text = $('#directory').text()
      expect(text).toBe(path.join(next.testDir, 'node_modules', 'sqlite3'))
    })

    // Inspect webpack server bundles
    if (!isTurbopack) {
      it('should externalize serverComponentsExternalPackages for server rendering layer', async () => {
        await next.fetch('/client')
        const ssrBundle = await next.readFile('.next/server/app/client/page.js')
        expect(ssrBundle).not.toContain('external-package-mark')
      })
    }
  }
)
