import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 30)

const fixturesDir = join(__dirname, '../../css-fixtures')
const appDir = join(fixturesDir, 'basic-module')
const nextConfig = join(fixturesDir, 'next.config.js')
let appPort
let app

describe('CSS optimization for SSR apps', () => {
  beforeAll(async () => {
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
    await fs.unlink(nextConfig)
  })
})
