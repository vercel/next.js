/* eslint-env jest */

import { join } from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should work with normal page', async () => {
    const html = await renderViaHTTP(appPort, '/blog')
    expect(html).toContain('Blog - CPE')
  })

  it('should work dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/nextjs')
    expect(html).toContain('Post - nextjs')
  })
}

describe('Custom page extension', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
