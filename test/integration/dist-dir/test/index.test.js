/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { BUILD_ID_FILE } from 'next/constants'
import {
  nextStart,
  nextBuild,
  findPort,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

describe('Production Usage', () => {
  describe('With basic usage', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    it('should build the app within the given `dist` directory', async () => {
      expect(
        await fs.exists(join(__dirname, `/../dist/${BUILD_ID_FILE}`))
      ).toBeTruthy()
    })
    it('should not build the app within the default `.next` directory', async () => {
      expect(
        await fs.exists(join(__dirname, `/../.next/${BUILD_ID_FILE}`))
      ).toBeFalsy()
    })
  })

  it('should throw error with invalid distDir', async () => {
    const origNextConfig = await fs.readFile(nextConfig, 'utf8')
    await fs.writeFile(nextConfig, `module.exports = { distDir: '' }`)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    await fs.writeFile(nextConfig, origNextConfig)

    expect(stderr).toContain(
      'Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined'
    )
  })

  it('should handle null/undefined distDir', async () => {
    const origNextConfig = await fs.readFile(nextConfig, 'utf8')
    await fs.writeFile(nextConfig, `module.exports = { distDir: null }`)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    await fs.writeFile(nextConfig, origNextConfig)

    expect(stderr.length).toBe(0)
  })
})
