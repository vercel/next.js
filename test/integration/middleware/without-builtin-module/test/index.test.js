/* eslint-env jest */

import { getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage } from 'next/dist/build/utils'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'

const context = {}

jest.setTimeout(1000 * 60 * 2)
context.appDir = join(__dirname, '../')

describe('Middleware importing Node.js built-in module', () => {
  function getModuleNotFound(name) {
    return `Module not found: Can't resolve '${name}'`
  }

  function escapeLF(s) {
    return s.replace(/\n/g, '\\n')
  }

  describe('dev mode', () => {
    let output = ''

    // restart the app for every test since the latest error is not shown sometimes
    beforeEach(async () => {
      output = ''
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    afterEach(() => killApp(context.app))

    it('does not show the not-supported error when importing non-node-builtin module', async () => {
      const res = await fetchViaHTTP(context.appPort, '/using-not-exist')
      expect(res.status).toBe(500)

      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('not-exist')
      expect(output).toContain(getModuleNotFound('not-exist'))
      expect(output).not.toContain(msg)
      expect(text).not.toContain(escapeLF(msg))
    })

    it('does not show the not-supported error when importing child_process module on a page', async () => {
      await fetchViaHTTP(context.appPort, '/using-child-process-on-page')

      // Need to request twice
      // See: https://github.com/vercel/next.js/issues/36387
      const res = await fetchViaHTTP(
        context.appPort,
        '/using-child-process-on-page'
      )

      expect(res.status).toBe(500)

      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      expect(output).toContain(getModuleNotFound('child_process'))
      expect(output).not.toContain(msg)
      expect(text).not.toContain(escapeLF(msg))
    })
  })

  describe('production mode', () => {
    let buildResult

    beforeAll(async () => {
      buildResult = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })
    })

    it('should not have middleware error during build', () => {
      expect(buildResult.stderr).toContain(getModuleNotFound('child_process'))
      expect(buildResult.stderr).not.toContain(
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      )
    })
  })
})
