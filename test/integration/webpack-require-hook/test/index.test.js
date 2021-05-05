/* eslint-env jest */

import path from 'path'

import {
  nextBuild,
  findPort,
  launchApp,
  renderViaHTTP,
  killApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = path.join(__dirname, '..')

describe('Handles Webpack Require Hook', () => {
  describe('build', () => {
    it('Does not error during build', async () => {
      const { stdout, stderr } = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      console.log(stderr)
      expect(stderr.length).toStrictEqual(0)
      expect(stdout).toMatch(/Initialized config/)
    })
  })

  describe('dev mode', () => {
    it('Applies and does not error during development', async () => {
      let output
      const handleOutput = (msg) => {
        output += msg
      }
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort, {
        onStdout: handleOutput,
        onStderr: handleOutput,
      })
      await renderViaHTTP(appPort, '/')
      await killApp(app)
      expect(output).toMatch(/Initialized config/)
    })
  })
})
