/* eslint-env jest */

import fsp from 'fs/promises'
import { join } from 'path'
import { BUILD_ID_FILE, BUILD_MANIFEST } from 'next/constants'
import {
  nextStart,
  nextBuild,
  findPort,
  killApp,
  renderViaHTTP,
  launchApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

describe('distDir', () => {
  describe('With basic usage', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
          await fsp.rm(join(appDir, 'dist'), { recursive: true, force: true })
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
            fs.existsSync(join(__dirname, `/../dist/${BUILD_ID_FILE}`))
          ).toBeTruthy()
        })
        it('should not build the app within the default `.next` directory', async () => {
          expect(fs.existsSync(join(__dirname, '/../.next'))).toBeFalsy()
        })
      }
    )
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      await fsp.rm(join(appDir, '.next'), { recursive: true, force: true })
      await fsp.rm(join(appDir, 'dist'), { recursive: true, force: true })
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    it('should build the app within the given `dist` directory', async () => {
      expect(
        fs.existsSync(join(__dirname, `/../dist/${BUILD_MANIFEST}`))
      ).toBeTruthy()
    })
    it('should not build the app within the default `.next` directory', async () => {
      expect(fs.existsSync(join(__dirname, '/../.next'))).toBeFalsy()
    })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should throw error with invalid distDir', async () => {
      const origNextConfig = await fsp.readFile(nextConfig, 'utf8')
      await fsp.writeFile(nextConfig, `module.exports = { distDir: '' }`)
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      await fsp.writeFile(nextConfig, origNextConfig)

      expect(stderr).toContain(
        'Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined'
      )
    })

    it('should handle undefined distDir', async () => {
      const origNextConfig = await fsp.readFile(nextConfig, 'utf8')
      await fsp.writeFile(
        nextConfig,
        `module.exports = { distDir: undefined, eslint: { ignoreDuringBuilds: true } }`
      )
      const { stderr } = await nextBuild(appDir, [], { stderr: true })
      await fsp.writeFile(nextConfig, origNextConfig)

      expect(stderr.length).toBe(0)
    })
  })
})
