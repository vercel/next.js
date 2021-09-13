/* eslint-env jest */

import fs from 'fs-extra'
import { join, sep } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {}

describe('Prerender native module', () => {
  describe('production', () => {
    beforeAll(async () => {
      const result = await nextBuild(appDir, undefined, {
        cwd: appDir,
        stderr: true,
        stdout: true,
      })

      if (result.code !== 0) {
        console.error(result)
        throw new Error(`Failed to build, exited with code ${result.code}`)
      }
      appPort = await findPort()
      app = await nextStart(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('dev', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, { cwd: appDir })
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
