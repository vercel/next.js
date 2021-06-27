/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  findPort,
  killApp,
  launchApp,
  runNextCommand,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

const dirSupported = join(__dirname, '../supported')
const dirPrerelease = join(__dirname, '../prerelease')

const UNSUPPORTED_PRERELEASE =
  "You are using an unsupported prerelease of 'react-dom'"
const USING_CREATE_ROOT = 'Using the createRoot API for React'

async function getBuildOutput(dir) {
  const { stdout, stderr } = await runNextCommand(['build', dir], {
    stdout: true,
    stderr: true,
  })
  return stdout + stderr
}

async function getDevOutput(dir) {
  const port = await findPort()

  let stdout = ''
  let stderr = ''
  let instance = await launchApp(dir, port, {
    stdout: true,
    stderr: true,
    onStdout(msg) {
      stdout += msg
    },
    onStderr(msg) {
      stderr += msg
    },
  })
  await killApp(instance)
  return stdout + stderr
}

describe('React 18 Support', () => {
  describe('build', () => {
    test('supported version of React', async () => {
      const output = await getBuildOutput(dirSupported)
      expect(output).not.toMatch(USING_CREATE_ROOT)
      expect(output).not.toMatch(UNSUPPORTED_PRERELEASE)
    })

    test('prerelease version of React', async () => {
      const output = await getBuildOutput(dirPrerelease)
      expect(output).toMatch(USING_CREATE_ROOT)
      expect(output).toMatch(UNSUPPORTED_PRERELEASE)
    })
  })

  describe('dev', () => {
    test('supported version of React', async () => {
      let output = await getDevOutput(dirSupported)
      expect(output).not.toMatch(USING_CREATE_ROOT)
      expect(output).not.toMatch(UNSUPPORTED_PRERELEASE)
    })

    test('prerelease version of React', async () => {
      let output = await getDevOutput(dirPrerelease)
      expect(output).toMatch(USING_CREATE_ROOT)
      expect(output).toMatch(UNSUPPORTED_PRERELEASE)
    })
  })

  describe('hydration', () => {
    const appDir = join(__dirname, '../prerelease')
    let app
    let appPort
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir, [dirPrerelease])
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => await killApp(app))
    it('hydrates correctly for normal page', async () => {
      const browser = await webdriver(appPort, '/')
      expect(await browser.eval('window.didHydrate')).toBe(true)
    })
  })
})
