/* eslint-env jest */
import globOrigig from 'glob'
import { promisify } from 'util'
import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import fs from 'fs-extra'

const glob = promisify(globOrigig)
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  it('should have all CSS files in manifest', async () => {
    const cssFiles = (
      await glob('**/*.css', {
        cwd: join(appDir, '.next/static'),
      })
    ).map((file) => join('.next/static', file))

    const requiredServerFiles = await fs.readJSON(
      join(appDir, '.next/required-server-files.json')
    )

    expect(
      requiredServerFiles.files.filter((file) => file.endsWith('.css'))
    ).toEqual(cssFiles)
  })

  it('should inline critical CSS', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_next\/static\/.*\.css" .*>/
    )
    expect(html).toMatch(/body{/)
  })

  it('should inline critical CSS (dynamic)', async () => {
    const html = await renderViaHTTP(appPort, '/another')
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/_next\/static\/.*\.css" .*>/
    )
    expect(html).toMatch(/body{/)
  })

  it('should not inline non-critical css', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).not.toMatch(/.extra-style/)
  })
}

describe('CSS optimization for SSR apps', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.writeFile(
          nextConfig,
          `module.exports = { experimental: {optimizeCss: true} }`,
          'utf8'
        )

        if (fs.pathExistsSync(join(appDir, '.next'))) {
          await fs.remove(join(appDir, '.next'))
        }
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
        await fs.remove(nextConfig)
      })
      runTests()
    }
  )
})
