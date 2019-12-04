/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  nextBuild,
  launchApp,
  findPort,
  killApp,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
const errorRegex = /unstable_getStaticPaths was added without a unstable_getStaticProps in/

describe('Catches Missing getStaticProps', () => {
  afterAll(() => fs.remove(nextConfig))

  it('should catch it in dev mode', async () => {
    const appPort = await findPort()
    const app = await launchApp(appDir, appPort)
    const html = await renderViaHTTP(appPort, '/hello')
    await killApp(app)

    expect(html).toMatch(errorRegex)
  })

  it('should catch it in server build mode', async () => {
    await fs.remove(nextConfig)
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toMatch(errorRegex)
  })

  it('should catch it in serverless mode', async () => {
    await fs.writeFile(
      nextConfig,
      `module.exports = { target: 'serverless' }`,
      'utf8'
    )
    const { stderr } = await nextBuild(appDir, [], {
      stderr: true,
    })
    expect(stderr).toMatch(errorRegex)
  })
})
