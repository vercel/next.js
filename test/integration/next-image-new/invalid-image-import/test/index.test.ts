/* eslint-env jest */

import { join } from 'path'
import {
  assertHasRedbox,
  findPort,
  getRedboxHeader,
  getRedboxSource,
  killApp,
  launchApp,
  nextBuild,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import stripAnsi from 'strip-ansi'

const appDir = join(__dirname, '../')
let appPort: number
let app
let stderr = ''

function runTests({ isDev }) {
  it('should show error', async () => {
    if (isDev) {
      const browser = await webdriver(appPort, '/')
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxHeader(browser)).toMatch('Failed to compile')
      const source = await getRedboxSource(browser)
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "./test/integration/next-image-new/invalid-image-import/public/invalid.svg
          Processing image failed
          Failed to parse svg source code for image dimensions

          Caused by:
          - Source code does not contain a <svg> root element"
        `)
      } else {
        expect(source).toMatchInlineSnapshot(`
          "./pages/index.js:3
          Error: Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format."
        `)
      }
    } else {
      const output = stripAnsi(stderr)
      if (process.env.TURBOPACK) {
        expect(output).toContain(
          `./test/integration/next-image-new/invalid-image-import/public/invalid.svg
Processing image failed
Failed to parse svg source code for image dimensions`
        )
      } else {
        expect(output).toContain(
          'Error: Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.'
        )
      }
    }
  })
}

describe('Missing Import Image Tests', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        stderr = ''
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStderr(msg) {
            stderr += msg || ''
          },
        })
      })
      afterAll(async () => {
        if (app) {
          await killApp(app)
        }
      })

      runTests({ isDev: true })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        stderr = ''
        const result = await nextBuild(appDir, [], { stderr: true })
        stderr = result.stderr
      })
      afterAll(async () => {
        if (app) {
          await killApp(app)
        }
      })

      runTests({ isDev: false })
    }
  )
})
