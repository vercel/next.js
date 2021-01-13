import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import fs, { remove } from 'fs-extra'

jest.setTimeout(1000 * 30)

const fixturesDir = join(__dirname, '../../css-fixtures')
const appDir = join(fixturesDir, 'basic-module')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

describe('CSS optimization for SSR apps', () => {
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await fs.writeFile(
      nextConfig,
      `module.exports = { experimental: { optimizeCss: true } }`,
      'utf8'
    )
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })

  it('should inline CSS', async () => {
    const content = await renderViaHTTP(appPort, '/')
    expect(content).toContain(
      '<style>.index_redText__3CwEB{color:red;}</style>'
    )
  })

  afterAll(async () => {
    killApp(app)
    await remove(nextConfig)
  })
})
