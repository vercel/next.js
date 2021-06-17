/* eslint-env jest */

import { findPort, killApp, launchApp, runNextCommand } from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 5)

const dirSupported = join(__dirname, '../supported')
const dirPrerelease = join(__dirname, '../prerelease')

const UNSUPPORTED_PRERELEASE =
  "You are using an unsupported prerelease of 'react-dom'"
const USING_CREATE_ROOT = 'Using the createRoot API for React'

describe('React 18 Support', () => {
  describe('build', () => {
    test('supported version of React', async () => {
      const { stdout, stderr } = await runNextCommand(['build', dirSupported], {
        stdout: true,
        stderr: true,
      })
      const output = stdout + stderr
      expect(output).not.toMatch(USING_CREATE_ROOT)
      expect(output).not.toMatch(UNSUPPORTED_PRERELEASE)
    })

    test('prerelease version of React', async () => {
      const { stdout, stderr } = await runNextCommand(
        ['build', dirPrerelease],
        {
          stdout: true,
          stderr: true,
        }
      )
      const output = stdout + stderr
      expect(output).toMatch(USING_CREATE_ROOT)
      expect(output).toMatch(UNSUPPORTED_PRERELEASE)
    })
  })

  describe('dev', () => {
    test('supported version of React', async () => {
      const port = await findPort()

      let stdout = ''
      let stderr = ''
      let instance = await launchApp(dirSupported, port, {
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

      let output = stdout + stderr
      expect(output).not.toMatch(USING_CREATE_ROOT)
      expect(output).not.toMatch(UNSUPPORTED_PRERELEASE)
    })

    test('prerelease version of React', async () => {
      const port = await findPort()

      let stdout = ''
      let stderr = ''
      let instance = await launchApp(dirPrerelease, port, {
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

      let output = stdout + stderr
      expect(output).toMatch(USING_CREATE_ROOT)
      expect(output).toMatch(UNSUPPORTED_PRERELEASE)
    })
  })
})
