/* eslint-env jest */

import fs from 'fs-extra'
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
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          await fs.remove(join(appDir, 'dist'))
          await nextBuild(appDir, [], { lint: true })
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
          expect(await fs.exists(join(__dirname, '/../.next'))).toBeFalsy()
        })
      }
    )
  })
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        await fs.remove(join(appDir, 'dist'))
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
          await fs.exists(join(__dirname, `/../dist/${BUILD_MANIFEST}`))
        ).toBeTruthy()
      })
      it('should not build the app within the default `.next` directory', async () => {
        expect(await fs.exists(join(__dirname, '/../.next'))).toBeFalsy()
      })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should throw error with invalid distDir', async () => {
        const origNextConfig = await fs.readFile(nextConfig, 'utf8')
        await fs.writeFile(nextConfig, `module.exports = { distDir: '' }`)
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          lint: true,
        })
        await fs.writeFile(nextConfig, origNextConfig)

        expect(stderr).toContain(
          'Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined'
        )
      })

      it('should handle undefined distDir', async () => {
        const origNextConfig = await fs.readFile(nextConfig, 'utf8')
        await fs.writeFile(
          nextConfig,
          `module.exports = { distDir: undefined, eslint: { ignoreDuringBuilds: true } }`
        )
        const { stderr } = await nextBuild(appDir, [], {
          stderr: true,
          lint: true,
        })
        await fs.writeFile(nextConfig, origNextConfig)

        expect(stderr).toBeEmpty()
      })
    }
  )
})
