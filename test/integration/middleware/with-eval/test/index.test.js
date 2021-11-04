/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
} from 'next-test-utils'

const context = {}
const DYNAMIC_CODE_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware`

jest.setTimeout(1000 * 60 * 2)
context.appDir = join(__dirname, '../')

describe('Middleware usage of dynamic code evaluation', () => {
  describe('dev mode', () => {
    let output = ''

    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })
    })

    beforeEach(() => (output = ''))
    afterAll(() => killApp(context.app))

    it('shows a warning when running code with eval', async () => {
      const res = await fetchViaHTTP(context.appPort, `/using-eval`)
      const json = await res.json()
      expect(json.value).toEqual(100)
      expect(output).toContain(DYNAMIC_CODE_ERROR)
    })

    it('does not show warning when no code uses eval', async () => {
      const res = await fetchViaHTTP(context.appPort, `/not-using-eval`)
      const json = await res.json()
      expect(json.value).toEqual(100)
      expect(output).not.toContain(DYNAMIC_CODE_ERROR)
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

    it('should have middleware warning during build', () => {
      expect(buildResult.stderr).toContain(`Failed to compile`)
      expect(buildResult.stderr).toContain(DYNAMIC_CODE_ERROR)
    })
  })
})
