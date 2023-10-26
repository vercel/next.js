/* eslint-env jest */

import path from 'path'

import {
  nextBuild,
  findPort,
  launchApp,
  renderViaHTTP,
  killApp,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

// Skip webpack specific test in Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Handles Webpack Require Hook',
  () => {
    describe('build', () => {
      it('Does not error during build', async () => {
        const { stdout, stderr } = await nextBuild(appDir, [], {
          stdout: true,
          stderr: true,
        })
        const errors = stderr
          .split('\n')
          .filter((line) => line && !line.trim().startsWith('⚠'))
        expect(errors).toEqual([])
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
  }
)
