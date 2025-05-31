/* eslint-env jest */
import fs from 'fs-extra'
import { dirname, join } from 'path'
import { nextBuild, getPageFilesFromBuildManifest } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

const appDir = join(__dirname, '../')

function extractSourceMappingURL(jsContent) {
  // Matches both //# and //@ sourceMappingURL=...
  const match = jsContent.match(/\/\/[#@] sourceMappingURL=([^\s]+)/)
  return match ? match[1] : null
}

async function checkSourceMapExistsForFile(jsFilePath) {
  const jsContent = await fs.readFile(jsFilePath, 'utf8')
  const sourceMappingURL = extractSourceMappingURL(jsContent)
  if (!sourceMappingURL) {
    return
  }
  expect(sourceMappingURL).toBeTruthy()
  const mapPath = join(dirname(jsFilePath), sourceMappingURL)
  expect(await fs.pathExists(mapPath)).toBe(true)
}

describe('Production browser sourcemaps', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('Server support', () => {
        beforeAll(async () => {
          await nextBuild(appDir, [], {})
        })

        it('includes sourcemaps for all browser files', async () => {
          const staticDir = join(appDir, '.next', 'static')
          const browserFiles = await recursiveReadDir(staticDir)
          const jsFiles = browserFiles.filter(
            (file) => file.endsWith('.js') && file.includes('/pages/')
          )
          expect(jsFiles).not.toBeEmpty()

          for (const file of jsFiles) {
            const jsPath = join(staticDir, file)
            checkSourceMapExistsForFile(jsPath)
          }
        })

        it('correctly generated the source map', async () => {
          const dotNextDir = join(appDir, '.next')
          const jsFiles = getPageFilesFromBuildManifest(appDir, '/static')
          for (const file of jsFiles) {
            const jsPath = join(dotNextDir, file)
            checkSourceMapExistsForFile(jsPath)
          }
        })
      })
    }
  )
})
