/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  hasRedbox,
  killApp,
  launchApp,
  nextBuild,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort: number
let app
let stderr = ''
const msg =
  /Error: Image with src "(.*)logo(.*)png" has legacy prop "layout". Did you forget to run the codemod?./

function runTests({ isDev }) {
  it('should show error', async () => {
    if (isDev) {
      const browser = await webdriver(appPort, '/')
      expect(await hasRedbox(browser, true)).toBe(true)
      expect(stderr).toMatch(msg)
    } else {
      expect(stderr).toMatch(msg)
    }
  })
}

describe('Missing Import Image Tests', () => {
  describe('dev mode', () => {
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
  })

  describe('server mode', () => {
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
  })
})
