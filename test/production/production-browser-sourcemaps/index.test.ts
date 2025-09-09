import fs from 'fs-extra'
import path from 'path'
import { getBuildManifest } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { nextTestSetup } from 'e2e-utils'

function extractSourceMappingURL(jsContent): string | null {
  // Matches both //# and //@ sourceMappingURL=...
  const match = jsContent.match(/\/\/[#@] sourceMappingURL=([^\s]+)/)
  return match ? match[1] : null
}

async function sourceMapExistsForFile(jsFilePath) {
  const jsContent = await fs.readFile(jsFilePath, 'utf8')
  const sourceMappingURL = extractSourceMappingURL(jsContent)
  if (!sourceMappingURL) {
    if (/^__turbopack_load_page_chunks__\(["']/.test(jsContent)) {
      // There is no sourcemap in these loader chunks, ignore
      return undefined
    }
    return false
  }
  const mapPath = path.join(path.dirname(jsFilePath), sourceMappingURL)
  return await fs.pathExists(mapPath)
}

describe('Production browser sourcemaps', () => {
  describe.each([false, true] as const)(
    'productionBrowserSourceMaps = %s',
    (productionBrowserSourceMaps) => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          productionBrowserSourceMaps,
        },
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      it('check sourcemaps for all browser files', async () => {
        const buildManifest = getBuildManifest(next.testDir)

        // These currently don't have sourcemaps
        let polyfillFiles = new Set(
          buildManifest.polyfillFiles.map((f) => '/' + path.basename(f))
        )

        const staticDir = path.join(next.testDir, '.next', 'static', 'chunks')
        const browserFiles = await recursiveReadDir(staticDir)
        const jsFiles = browserFiles.filter(
          (file) => file.endsWith('.js') && !polyfillFiles.has(file)
        )
        expect(jsFiles).not.toBeEmpty()

        for (const file of jsFiles) {
          const jsPath = path.join(staticDir, file)
          expect(await sourceMapExistsForFile(jsPath)).toBeOneOf([
            productionBrowserSourceMaps,
            undefined,
          ])
        }

        for (let page of ['/ssr', '/static']) {
          const jsFiles = buildManifest.pages[page]
          for (const file of jsFiles) {
            const jsPath = path.join(next.testDir, '.next', file)
            expect(await sourceMapExistsForFile(jsPath)).toBe(
              productionBrowserSourceMaps
            )
          }
        }
      })
    }
  )
})
