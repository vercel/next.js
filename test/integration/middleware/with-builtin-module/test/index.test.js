/* eslint-env jest */

import stripAnsi from 'next/dist/compiled/strip-ansi'
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
const WEBPACK_BREAKING_CHANGE = 'BREAKING CHANGE:'

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
    // See https://github.com/vercel/next.js/issues/36575
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

    it('shows error when importing path module', async () => {
      const res = await fetchViaHTTP(context.appPort, '/using-path')
      const text = await res.text()
      await waitFor(500)
      const msg = getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('path')
      expect(res.status).toBe(500)
      expect(output).toContain(getModuleNotFound('path'))
      expect(output).toContain(msg)
      expect(text).toContain(escapeLF(msg))
      expect(stripAnsi(output)).toContain("import { basename } from 'path'")
      expect(output).not.toContain(WEBPACK_BREAKING_CHANGE)
    })

    it('shows error when importing child_process module', async () => {
      const res = await fetchViaHTTP(context.appPort, '/using-child-process')
      const text = await res.text()
      await waitFor(500)
      const msg =
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      expect(res.status).toBe(500)
      expect(output).toContain(getModuleNotFound('child_process'))
      expect(output).toContain(msg)
      expect(text).toContain(escapeLF(msg))
      expect(stripAnsi(output)).toContain(
        "import { spawn } from 'child_process'"
      )
      expect(output).not.toContain(WEBPACK_BREAKING_CHANGE)
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

    it('should have middleware error during build', () => {
      expect(buildResult.stderr).toContain(getModuleNotFound('child_process'))
      expect(buildResult.stderr).toContain(getModuleNotFound('path'))
      expect(buildResult.stderr).toContain(
        getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage('child_process')
      )
      expect(buildResult.stderr).not.toContain(WEBPACK_BREAKING_CHANGE)
    })
  })
})
