/* eslint-env jest */

import { join } from 'path'
import { check, findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort: number
let app: Awaited<ReturnType<typeof launchApp>>
let output = ''

describe('Image is intercepted by Middleware', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStdout: (s) => {
            output += s
          },
          onStderr: (s) => {
            output += s
          },
        })
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should find log from _next/image intercept', async () => {
        const browser = await webdriver(appPort, '/')

        await browser.waitForIdleNetwork()

        await check(() => output, /compiled \//i)

        expect(output).toContain(`x-_next-image: /small.jpg`)
      })
    }
  )
})
