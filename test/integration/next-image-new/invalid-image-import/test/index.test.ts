/* eslint-env jest */

import { join } from 'path'
import { findPort, killApp, launchApp, nextBuild } from 'next-test-utils'
import webdriver from 'next-webdriver'
import stripAnsi from 'strip-ansi'

describe('Missing Import Image Tests', () => {
  const isNextDev = process.env.NEXT_TEST_MODE === 'dev'
  const isTurbopack = Boolean(process.env.TURBOPACK)
  const appDir = join(__dirname, '../')
  let appPort: number
  let app: Awaited<ReturnType<typeof launchApp>> | undefined
  let stderr = ''

  beforeAll(async () => {
    stderr = ''
    if (isNextDev) {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    } else {
      const result = await nextBuild(appDir, [], { stderr: true })
      stderr = result.stderr
    }
  })
  afterAll(async () => {
    if (app) {
      await killApp(app)
    }
  })

  it('should show error', async () => {
    if (isNextDev) {
      const browser = await webdriver(appPort, '/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Processing image failed",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./test/integration/next-image-new/invalid-image-import/public/invalid.svg
         Processing image failed
         Failed to parse svg source code for image dimensions
         Caused by:
         - Source code does not contain a <svg> root element",
           "stack": [],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./pages/index.js:3
         Error: Image import "../public/invalid.svg" is not a valid image file. The image may be corrupted or an unsupported format.",
           "stack": [],
         }
        `)
      }
    } else {
      const output = stripAnsi(stderr)
      if (isTurbopack) {
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
})
