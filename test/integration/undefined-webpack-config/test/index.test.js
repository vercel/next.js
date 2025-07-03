/* eslint-env jest */

import { join } from 'path'
import { launchApp, findPort, nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '../')
const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Tests webpack, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'undefined webpack config error',
  () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
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

    it('should show in development mode', async () => {
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
