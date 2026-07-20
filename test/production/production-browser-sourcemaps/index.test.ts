import fs from 'fs-extra'
import path from 'path'
import { getBuildManifest } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { isReact18, nextTestSetup } from 'e2e-utils'

function extractSourceMappingURL(jsContent: string): string | null {
  // Matches both //# and //@ sourceMappingURL=...
  const match = jsContent.match(/\/\/[#@] sourceMappingURL=([^\s]+)/)
  return match ? match[1] : null
}

async function validateSourceMapForChunk(
  dir: string,
  file: string,
  {
    polyfillFiles,
    productionBrowserSourceMaps,
  }: { polyfillFiles: string[]; productionBrowserSourceMaps: boolean }
) {
  const jsFilePath = path.join(dir, file)
  const jsContent = await fs.readFile(jsFilePath, 'utf8')
  const sourceMappingURL = extractSourceMappingURL(jsContent)
  if (!sourceMappingURL) {
    if (
      /^__turbopack_load_page_chunks__\(["']/.test(jsContent) ||
      (!process.env.IS_TURBOPACK_TEST && jsContent.length < 300)
    ) {
      // There is no sourcemap in these loader chunks, ignore
      return
    }
    if (await fs.pathExists(jsFilePath + '.map')) {
      // sourcemap file exists, but without sourceMappingURL comment
      // currently the case for polyfills chunk
      if (!productionBrowserSourceMaps) {
        throw new Error(`Source map file exists for ${jsFilePath}.`)
      }
    }
    if (polyfillFiles.some((f) => f.endsWith(file))) {
      // polyfill files might not have sourcemaps, ignore
      return
    }
    if (productionBrowserSourceMaps) {
      throw new Error(`Source map missing for ${jsFilePath}.`)
    }
    return
  }
  const mapPath = path.join(path.dirname(jsFilePath), sourceMappingURL)
  if ((await fs.pathExists(mapPath)) !== productionBrowserSourceMaps) {
    throw new Error(`Source map presence mismatch for ${jsFilePath}.`)
  }
}

async function getBrowserSourceMaps(distDir: string) {
  const sourceMaps: any[] = []

  for (let dir of ['static', 'static/immutable']) {
    const chunksDir = path.join(distDir, dir, 'chunks')
    if (!fs.existsSync(chunksDir)) {
      continue
    }

    const browserFiles = await recursiveReadDir(chunksDir)
    const sourceMapFiles = browserFiles.filter((file) =>
      file.endsWith('.js.map')
    )

    for (const file of sourceMapFiles) {
      sourceMaps.push(await fs.readJSON(path.join(chunksDir, file)))
    }
  }

  return sourceMaps
}

function findSourceContent(sourceMaps: any[], sourceSuffix: string) {
  for (const sourceMap of sourceMaps) {
    const sourceIndex = sourceMap.sources?.findIndex((source: string) =>
      source.endsWith(sourceSuffix)
    )

    if (sourceIndex >= 0) {
      return sourceMap.sourcesContent?.[sourceIndex]
    }
  }

  return undefined
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
      })

      if (skipped) {
        return
      }

      it('check sourcemaps for all browser files', async () => {
        const buildManifest = getBuildManifest(next.testDir)

        for (let dir of ['static', 'static/immutable']) {
          const chunksDir = path.join(next.testDir, '.next', dir, 'chunks')
          if (fs.existsSync(chunksDir)) {
            const browserFiles = await recursiveReadDir(chunksDir)
            const jsFiles = browserFiles.filter((file) => file.endsWith('.js'))
            expect(jsFiles).not.toBeEmpty()

            for (const file of jsFiles) {
              await validateSourceMapForChunk(chunksDir, file, {
                polyfillFiles: buildManifest.polyfillFiles,
                productionBrowserSourceMaps,
              })
            }
          }
        }

        for (let page of ['/ssr', '/static']) {
          const jsFiles = buildManifest.pages[page]
          for (const file of jsFiles) {
            await validateSourceMapForChunk(
              path.join(next.testDir, '.next'),
              file,
              {
                polyfillFiles: buildManifest.polyfillFiles,
                productionBrowserSourceMaps,
              }
            )
          }
        }
      })
    }
  )
})

describe('Production browser sourcemaps with React Compiler', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      productionBrowserSourceMaps: true,
      reactCompiler: true,
    },
    dependencies: {
      'babel-plugin-react-compiler': '0.0.0-experimental-3fde738-20250918',
      ...(isReact18 ? { 'react-compiler-runtime': 'latest' } : {}),
    },
  })

  if (!skipped) {
    it('preserves original client sourcesContent after React Compiler transforms', async () => {
      const sourceMaps = await getBrowserSourceMaps(
        path.join(next.testDir, '.next')
      )
      const sourceContent = findSourceContent(sourceMaps, '/app/client.js')

      expect(sourceContent).toContain('original-source-map-marker')
      expect(sourceContent).toContain('useState')

      if (isTurbopack) {
        expect(sourceContent).not.toContain('react/compiler-runtime')
        expect(sourceContent).not.toContain('_c(')
      }
    })
  }
})
