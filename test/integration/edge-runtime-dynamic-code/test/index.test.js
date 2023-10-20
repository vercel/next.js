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

const EVAL_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
const DYNAMIC_CODE_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
const WASM_COMPILE_ERROR = `Dynamic WASM code generation (e. g. 'WebAssembly.compile') not allowed in Edge Runtime`
const WASM_INSTANTIATE_ERROR = `Dynamic WASM code generation ('WebAssembly.instantiate' with a buffer parameter) not allowed in Edge Runtime`

jest.setTimeout(1000 * 60 * 2)
const context = {
  appDir: join(__dirname, '../'),
}

describe('Page using eval in dev mode', () => {
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

  it('does issue dynamic code evaluation warnings', async () => {
    const html = await renderViaHTTP(context.appPort, '/')
    expect(html).toMatch(/>.*?100.*?and.*?100.*?<\//)
    await waitFor(500)
    expect(output).not.toContain(EVAL_ERROR)
    expect(output).not.toContain(DYNAMIC_CODE_ERROR)
    expect(output).not.toContain(WASM_COMPILE_ERROR)
    expect(output).not.toContain(WASM_INSTANTIATE_ERROR)
  })
})

describe.each([
  {
    title: 'Middleware',
    computeRoute(useCase) {
      return `/${useCase}`
    },
    async extractValue(response) {
      return JSON.parse(response.headers.get('data')).value
    },
  },
  {
    title: 'Edge route',
    computeRoute(useCase) {
      return `/api/route?case=${useCase}`
    },
    async extractValue(response) {
      return (await response.json()).value
    },
  },
])(
  '$title usage of dynamic code evaluation',
  ({ extractValue, computeRoute }) => {
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
        const res = await fetchViaHTTP(
          context.appPort,
          computeRoute('using-eval')
        )
        expect(await extractValue(res)).toEqual(100)
        await waitFor(500)
        expect(output).toContain(EVAL_ERROR)
        // TODO check why that has a backslash on windows
        expect(output).toMatch(/lib[\\/]utils\.js/)
        expect(output).toContain('usingEval')
        expect(stripAnsi(output)).toContain("value: eval('100')")
      })

      it('does not show warning when no code uses eval', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          computeRoute('not-using-eval')
        )
        expect(await extractValue(res)).toEqual(100)
        await waitFor(500)
        expect(output).not.toContain('Dynamic Code Evaluation')
      })

      it('shows a warning when running WebAssembly.compile', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          computeRoute('using-webassembly-compile')
        )
        expect(await extractValue(res)).toEqual(81)
        await waitFor(500)
        expect(output).toContain(WASM_COMPILE_ERROR)
        expect(output).toMatch(/lib[\\/]wasm\.js/)
        expect(output).toContain('usingWebAssemblyCompile')
        expect(stripAnsi(output)).toContain(
          'await WebAssembly.compile(SQUARE_WASM_BUFFER)'
        )
      })

      it('shows a warning when running WebAssembly.instantiate with a buffer parameter', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          computeRoute('using-webassembly-instantiate-with-buffer')
        )
        expect(await extractValue(res)).toEqual(81)
        await waitFor(500)
        expect(output).toContain(WASM_INSTANTIATE_ERROR)
        expect(output).toMatch(/lib[\\/]wasm\.js/)
        expect(output).toContain('usingWebAssemblyInstantiateWithBuffer')
        expect(stripAnsi(output)).toContain(
          'await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})'
        )
      })

      it('does not show a warning when running WebAssembly.instantiate with a module parameter', async () => {
        const res = await fetchViaHTTP(
          context.appPort,
          computeRoute('using-webassembly-instantiate')
        )
        expect(await extractValue(res)).toEqual(81)
        await waitFor(500)
        expect(output).not.toContain(WASM_INSTANTIATE_ERROR)
        expect(output).not.toContain('DynamicWasmCodeGenerationWarning')
      })
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        let buildResult

        beforeAll(async () => {
          buildResult = await nextBuild(context.appDir, undefined, {
            stderr: true,
            stdout: true,
          })
        })

        it('should have middleware warning during build', () => {
          expect(buildResult.stderr).toContain(`Failed to compile`)
          expect(buildResult.stderr).toContain(
            `Used by usingEval, usingEvalSync`
          )
          expect(buildResult.stderr).toContain(
            `Used by usingWebAssemblyCompile`
          )
          expect(buildResult.stderr).toContain(DYNAMIC_CODE_ERROR)
        })
      }
    )
  }
)
