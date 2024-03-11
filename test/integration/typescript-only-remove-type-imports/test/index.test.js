/* eslint-env jest */

import { join } from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let app
let appPort

const runTests = () => {
  it('should render a normal page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/normal')
    expect(html).toContain('A normal one')
  })

  it('should render a page with type import correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('anton')
    expect(html).toContain('berta')
  })
}

// Test specific Babel feature that is not supported in Turbopack.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'TypeScript onlyRemoveTypeImports',
  () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          const { code } = await nextBuild(appDir)
          if (code !== 0) throw new Error(`build failed with code ${code}`)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(() => killApp(app))

        runTests()
      }
    )

    describe('dev mode', () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    })
  }
)
