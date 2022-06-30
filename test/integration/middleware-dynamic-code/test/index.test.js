/* eslint-env jest */

import stripAnsi from 'next/dist/compiled/strip-ansi'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const context = {}
const EVAL_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Middleware`
const DYNAMIC_CODE_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Middleware`
const WASM_COMPILE_ERROR = `Dynamic WASM code generation (e. g. 'WebAssembly.compile') not allowed in Middleware`
const WASM_INSTANTIATE_ERROR = `Dynamic WASM code generation ('WebAssembly.instantiate' with a buffer parameter) not allowed in Middleware`

jest.setTimeout(1000 * 60 * 2)
context.appDir = join(__dirname, '../')

describe('Middleware usage of dynamic code evaluation', () => {
  describe('dev mode', () => {
    let output = ''

    beforeAll(async () => {
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

    beforeEach(() => (output = ''))
    afterAll(() => killApp(context.app))

    it('shows a warning when running code with eval', async () => {
      const res = await fetchViaHTTP(context.appPort, `/using-eval`)
      const json = JSON.parse(res.headers.get('data'))
      await waitFor(500)
      expect(json.value).toEqual(100)
      expect(output).toContain(EVAL_ERROR)
      expect(output).toContain('DynamicCodeEvaluationWarning')
      expect(output).toContain('./middleware')
      // TODO check why that has a backslash on windows
      expect(output).toMatch(/lib[\\/]utils\.js/)
      expect(output).toContain('usingEval')
      expect(stripAnsi(output)).toContain("value: eval('100')")
    })

    it('does not show warning when no code uses eval', async () => {
      const res = await fetchViaHTTP(context.appPort, `/not-using-eval`)
      const json = JSON.parse(res.headers.get('data'))
      await waitFor(500)
      expect(json.value).toEqual(100)
      expect(output).not.toContain('Dynamic Code Evaluation')
    })

    it('does not has problems with eval in page or server code', async () => {
      const html = await renderViaHTTP(context.appPort, `/`)
      expect(html).toMatch(/>.*?100.*?and.*?100.*?<\//)
      await waitFor(500)
      expect(output).not.toContain('Dynamic Code Evaluation')
    })

    it('shows a warning when running WebAssembly.compile', async () => {
      const res = await fetchViaHTTP(
        context.appPort,
        `/using-webassembly-compile`
      )
      const json = JSON.parse(res.headers.get('data'))
      await waitFor(500)
      expect(json.value).toEqual(81)
      expect(output).toContain(WASM_COMPILE_ERROR)
      expect(output).toContain('DynamicWasmCodeGenerationWarning')
      expect(output).toContain('./middleware')
      expect(output).toMatch(/lib[\\/]wasm\.js/)
      expect(output).toContain('usingWebAssemblyCompile')
      expect(stripAnsi(output)).toContain(
        'await WebAssembly.compile(SQUARE_WASM_BUFFER)'
      )
    })

    it('shows a warning when running WebAssembly.instantiate w/ a buffer parameter', async () => {
      const res = await fetchViaHTTP(
        context.appPort,
        `/using-webassembly-instantiate-with-buffer`
      )
      const json = JSON.parse(res.headers.get('data'))
      await waitFor(500)
      expect(json.value).toEqual(81)
      expect(output).toContain(WASM_INSTANTIATE_ERROR)
      expect(output).toContain('DynamicWasmCodeGenerationWarning')
      expect(output).toContain('./middleware')
      expect(output).toMatch(/lib[\\/]wasm\.js/)
      expect(output).toContain('usingWebAssemblyInstantiateWithBuffer')
      expect(stripAnsi(output)).toContain(
        'await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})'
      )
    })

    it('does not show a warning when running WebAssembly.instantiate w/ a module parameter', async () => {
      const res = await fetchViaHTTP(
        context.appPort,
        `/using-webassembly-instantiate`
      )
      const json = JSON.parse(res.headers.get('data'))
      await waitFor(500)
      expect(json.value).toEqual(81)
      expect(output).not.toContain(WASM_INSTANTIATE_ERROR)
      expect(output).not.toContain('DynamicWasmCodeGenerationWarning')
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
      expect(buildResult.stderr).toContain(`Used by usingEval`)
      expect(buildResult.stderr).toContain(`./middleware.js`)
      expect(buildResult.stderr).toContain(DYNAMIC_CODE_ERROR)
    })
  })
})
