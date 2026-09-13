import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('app-dir - server components externals', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    // This test is skipped when deployed because it relies on manually patched `node_modules`
    skipDeployment: true,
    files: __dirname,
  })

  if (skipped) return

  it('should have externals for those in config.serverExternalPackages', async () => {
    const $ = await next.render$('/')

    const text = $('#directory').text()
    const subpath = $('#subdirectory').text()
    expect(text).toBe(
      path.join(next.testDir, 'node_modules', 'external-package')
    )
    expect(subpath).toBe(
      path.join(next.testDir, 'node_modules', 'external-package', 'subpath')
    )
  })

  it('uses externals for predefined list in server-external-packages.json', async () => {
    const $ = await next.render$('/predefined')

    // `keyv` is on the built-in list in
    // packages/next/src/lib/server-external-packages.jsonc. Resolving to the
    // package's own directory is what proves it stayed external: a bundled copy
    // would report the chunk's directory instead. The package here is a stub, so
    // the assertion is about the list rather than about anything `keyv` does.
    const text = $('#directory').text()
    expect(text).toBe(path.join(next.testDir, 'node_modules', 'keyv'))
  })

  // Inspect webpack server bundles
  if (!isTurbopack) {
    it('should externalize serversExternalPackages for server rendering layer', async () => {
      await next.fetch('/client')
      const ssrBundle = await next.readFile(
        `${next.distDir}/server/app/client/page.js`
      )
      expect(ssrBundle).not.toContain('external-package-mark:index')
      expect(ssrBundle).not.toContain('external-package-mark:subpath')

      await next.fetch('/')
      const rscBundle = await next.readFile(
        `${next.distDir}/server/app/page.js`
      )
      expect(rscBundle).not.toContain('external-package-mark:index')
      expect(rscBundle).not.toContain('external-package-mark:subpath')
    })
  }
})
