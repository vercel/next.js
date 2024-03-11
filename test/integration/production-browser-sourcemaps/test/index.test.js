/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild, getPageFileFromBuildManifest } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

const appDir = join(__dirname, '../')

function runTests() {
  it('includes sourcemaps for all browser files', async () => {
    const browserFiles = await recursiveReadDir(join(appDir, '.next', 'static'))
    const jsFiles = browserFiles.filter(
      (file) => file.endsWith('.js') && file.includes('/pages/')
    )

    jsFiles.forEach((file) => {
      expect(browserFiles.includes(`${file}.map`)).toBe(true)
    })
  })

  it('correctly generated the source map', async () => {
    const map = JSON.parse(
      await fs.readFile(
        join(
          appDir,
          '.next',
          (await getPageFileFromBuildManifest(appDir, '/static')) + '.map'
        ),
        'utf8'
      )
    )

    expect(map.sources).toContainEqual(
      expect.stringMatching(/pages[/\\]static\.js/)
    )
    expect(map.names).toContainEqual('StaticPage')
  })
}

describe('Production browser sourcemaps', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('Server support', () => {
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
      })

      runTests()
    })
  })
})
