/* eslint-env jest */

import { join } from 'path'
import { launchApp, findPort, nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Tests webpack, not needed for Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'undefined webpack config error',
  () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it.skip('should show in production mode', async () => {
          const result = await nextBuild(appDir, [], {
            stdout: true,
            stderr: true,
          })
          expect(result.stderr || '' + result.stdout || '').toMatch(expectedErr)
        })
      }
    )

    it('should show in dev mode', async () => {
      let output = ''

      await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          output += msg || ''
        },
        ontStdout(msg) {
          output += msg || ''
        },
      })

      expect(output).toMatch(expectedErr)
    })
  }
)
