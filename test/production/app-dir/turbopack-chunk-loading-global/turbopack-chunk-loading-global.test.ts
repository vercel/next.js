import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

function collectJsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .flatMap((entry) => {
      const full = path.join(dir, entry)
      return entry.endsWith('.js') && fs.statSync(full).isFile() ? [full] : []
    })
}

describe('turbopack-chunk-loading-global', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  ;(isNextDeploy ? describe.skip : describe)('chunk output', () => {
    it('uses the custom global name and drops the default TURBOPACK global', async () => {
      const staticDir = path.join(next.testDir, '.next/static')
      const jsFiles = collectJsFiles(staticDir)
      expect(jsFiles.length).toBeGreaterThan(0)

      const allContent = jsFiles
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n')

      // Custom global must be registered as a chunk-loading global
      expect(allContent).toContain('globalThis.myApp')
      // And the derived chunk list global must use the same name
      expect(allContent).toContain('globalThis.myApp_CHUNK_LISTS')

      // Default TURBOPACK chunk-loading globals must not appear — if they
      // do, chunkLoadingGlobal was ignored by the Rust layer.
      expect(allContent).not.toContain('globalThis.TURBOPACK')
      expect(allContent).not.toContain('globalThis.TURBOPACK_CHUNK_LISTS')
    })
  })

  describe('runtime behavior', () => {
    it('renders content and handles interactions after hydration', async () => {
      const browser = await next.browser('/')

      // Initial render
      expect(await browser.elementByCss('#count').text()).toBe('0')

      // Click increments — proves chunks loaded and JS executed correctly
      await browser.elementByCss('button').click()
      expect(await browser.elementByCss('#count').text()).toBe('1')

      await browser.elementByCss('button').click()
      expect(await browser.elementByCss('#count').text()).toBe('2')
    })
  })
})
