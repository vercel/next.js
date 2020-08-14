/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let nextConfigContent

function runTests() {
  it('includes sourcemaps for all browser files', async () => {
    const browserFiles = await recursiveReadDir(
      join(appDir, '.next', 'static'),
      /.*/
    )
    const jsFiles = browserFiles.filter(
      (file) => file.endsWith('.js') && file.includes('/pages/')
    )

    jsFiles.forEach((file) => {
      expect(browserFiles.includes(`${file}.map`)).toBe(true)
    })
  })
}

describe('Production browser sourcemaps', () => {
  describe('Server support', () => {
    beforeAll(async () => {
      await nextBuild(appDir, [], {})
    })

    runTests()
  })

  describe('Serverless support', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            productionBrowserSourceMaps: true
          }
        }
      `
      )
      await nextBuild(appDir, [], {})
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, nextConfigContent)
    })

    runTests()
  })
})
