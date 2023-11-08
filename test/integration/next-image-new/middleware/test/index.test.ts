/* eslint-env jest */

import { join } from 'path'
import { check, findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort: number
let app: Awaited<ReturnType<typeof launchApp>>
let output = ''

describe('Image with middleware in edge func', () => {
  describe('dev mode', () => {
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

    it('should not error', async () => {
      /**
        ⚠️ ../../../../packages/next/dist/esm/client/image-component.js
        Attempted import error: 'preload' is not exported from 'react-dom' (imported as 'preload').
       */
      await webdriver(appPort, '/')
      await check(() => output, /compiled \//i)
      expect(output).not.toContain(`'preload' is not exported from 'react-dom'`)
    })
  })
})
