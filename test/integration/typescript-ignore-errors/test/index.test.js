/* global fixture, test */
import 'testcafe'

import { join } from 'path'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp,
  File
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfigFile = new File(join(appDir, 'next.config.js'))

fixture('TypeScript with error handling options')

for (const ignoreDevErrors of [false, true]) {
  for (const ignoreBuildErrors of [false, true]) {
    fixture(
      `ignoreDevErrors: ${ignoreDevErrors}, ignoreBuildErrors: ${ignoreBuildErrors}`
    )
      .before(() => {
        const nextConfig = {
          typescript: { ignoreDevErrors, ignoreBuildErrors }
        }
        nextConfigFile.replace('{}', JSON.stringify(nextConfig))
      })
      .after(() => nextConfigFile.restore())

    test(
      ignoreDevErrors
        ? 'Next renders the page in dev despite type errors'
        : 'Next dev does not render the page in dev because of type errors',
      async t => {
        let app
        let output = ''
        try {
          const appPort = await findPort()
          app = await launchApp(appDir, appPort, {
            onStdout: msg => (output += msg),
            onStderr: msg => (output += msg)
          })
          await renderViaHTTP(appPort, '')

          if (ignoreDevErrors) {
            await t
              .expect(output)
              .notContains('waiting for typecheck results...')
            await t
              .expect(output)
              .notContains("not assignable to type 'boolean'")
          } else {
            await t.expect(output).contains('waiting for typecheck results...')
            await t.expect(output).contains("not assignable to type 'boolean'")
          }
        } finally {
          await killApp(app)
        }
      }
    )

    test(
      ignoreBuildErrors
        ? 'Next builds the application despite type errors'
        : 'Next fails to build the application despite type errors',
      async t => {
        const { stdout, stderr } = await nextBuild(appDir, [], {
          stdout: true,
          stderr: true
        })

        if (ignoreBuildErrors) {
          await t.expect(stdout).contains('Compiled successfully')
          await t.expect(stderr).notContains('Failed to compile.')
          await t.expect(stderr).notContains("not assignable to type 'boolean'")
        } else {
          await t.expect(stdout).notContains('Compiled successfully')
          await t.expect(stderr).contains('Failed to compile.')
          await t.expect(stderr).contains("not assignable to type 'boolean'")
        }
      }
    )
  }
}
