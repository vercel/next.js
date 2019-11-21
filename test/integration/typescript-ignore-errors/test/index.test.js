/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp,
  File,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
const nextConfigFile = new File(join(appDir, 'next.config.js'))

describe('TypeScript with error handling options', () => {
  for (const ignoreDevErrors of [false, true]) {
    for (const ignoreBuildErrors of [false, true]) {
      describe(`ignoreDevErrors: ${ignoreDevErrors}, ignoreBuildErrors: ${ignoreBuildErrors}`, () => {
        beforeAll(() => {
          const nextConfig = {
            typescript: { ignoreDevErrors, ignoreBuildErrors },
          }
          nextConfigFile.replace('{}', JSON.stringify(nextConfig))
        })
        afterAll(() => {
          nextConfigFile.restore()
        })

        it(
          ignoreDevErrors
            ? 'Next renders the page in dev despite type errors'
            : 'Next dev does not render the page in dev because of type errors',
          async () => {
            let app
            let output = ''
            try {
              const appPort = await findPort()
              app = await launchApp(appDir, appPort, {
                onStdout: msg => (output += msg),
                onStderr: msg => (output += msg),
              })
              await renderViaHTTP(appPort, '')

              if (ignoreDevErrors) {
                expect(output).not.toContain('waiting for typecheck results...')
                expect(output).not.toContain("not assignable to type 'boolean'")
              } else {
                expect(output).toContain('waiting for typecheck results...')
                expect(output).toContain("not assignable to type 'boolean'")
              }
            } finally {
              await killApp(app)
            }
          }
        )

        it(
          ignoreBuildErrors
            ? 'Next builds the application despite type errors'
            : 'Next fails to build the application despite type errors',
          async () => {
            const { stdout, stderr } = await nextBuild(appDir, [], {
              stdout: true,
              stderr: true,
            })

            if (ignoreBuildErrors) {
              expect(stdout).toContain('Compiled successfully')
              expect(stderr).not.toContain('Failed to compile.')
              expect(stderr).not.toContain("not assignable to type 'boolean'")
            } else {
              expect(stdout).not.toContain('Compiled successfully')
              expect(stderr).toContain('Failed to compile.')
              expect(stderr).toContain("not assignable to type 'boolean'")
            }
          }
        )
      })
    }
  }
})
