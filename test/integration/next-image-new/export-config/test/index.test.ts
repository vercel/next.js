/* eslint-env jest */

import { join } from 'path'
import {
  assertHasRedbox,
  findPort,
  getRedboxHeader,
  killApp,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let app
let stderr = ''

describe('next/image with output export config', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStderr(msg) {
            stderr += msg || ''
          },
        })
      })
      afterAll(async () => {
        await killApp(app)
        stderr = ''
      })
      it('should error', async () => {
        const browser = await webdriver(appPort, '/')
        const msg =
          "Image Optimization using the default loader is not compatible with `{ output: 'export' }`."
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toContain(msg)
        expect(stderr).toContain(msg)
      })
    }
  )
})
