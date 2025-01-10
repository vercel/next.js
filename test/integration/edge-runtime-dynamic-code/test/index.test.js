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

const isTurbopack = process.env.TURBOPACK

describe('Page using eval in development mode', () => {
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
  ({ extractValue, computeRoute, title }) => {
    ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
      'development mode',
      () => {
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
          if (title === 'Middleware') {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/utils.js:11:16)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:12:52)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/lib/utils.js:11:18)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:12:53)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at eval (../packages/next/dist'
            )
          } else {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/utils.js:11:16)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:13:22)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/lib/utils.js:11:18)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:13:23)' +
                    '\n   9 | export async function usingEval() {'
            )
          }

          // TODO(veil): Inconsistent cursor position
          if (isTurbopack) {
            expect(output).toContain(
              '' +
                "\n> 11 |   return { value: eval('100') }" +
                '\n     |                ^'
            )
          } else {
            expect(output).toContain(
              '' +
                "\n> 11 |   return { value: eval('100') }" +
                '\n     |                  ^'
            )
          }
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
          if (title === 'Middleware') {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:17)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:24:68)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:23)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:24:68)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
            )
          } else {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:17)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:17:42)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '' +
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:23)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:17:42)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
            )

            // TODO(veil): Inconsistent cursor position
            if (isTurbopack) {
              expect(output).toContain(
                '' +
                  '\n> 22 |   const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)' +
                  '\n     |                 ^'
              )
            } else {
              expect(output).toContain(
                '' +
                  '\n> 22 |   const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)' +
                  '\n     |                       ^'
              )
            }
          }
        })

        it('shows a warning when running WebAssembly.instantiate with a buffer parameter', async () => {
          const res = await fetchViaHTTP(
            context.appPort,
            computeRoute('using-webassembly-instantiate-with-buffer')
          )
          expect(await extractValue(res)).toEqual(81)
          await waitFor(500)
          expect(output).toContain(WASM_INSTANTIATE_ERROR)
          if (title === 'Middleware') {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:23)' +
                    '\n    at async middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:37:29)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '' +
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:23)' +
                    '\n    at async middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:37:29)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at '
            )
            expect(stripAnsi(output)).toContain(
              '' +
                '\n> 28 |   const { instance } = await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})' +
                '\n     |                       ^'
            )
          } else {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    // TODO(veil): Turbopack duplicates project path
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:23)' +
                    '\n    at async handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:21:16)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
                : '' +
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:23)' +
                    '\n    at async handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:21:16)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
            )
            expect(stripAnsi(output)).toContain(
              '' +
                '\n> 28 |   const { instance } = await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})' +
                '\n     |                       ^'
            )
          }
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
      }
    )
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
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
          if (process.env.TURBOPACK) {
            expect(buildResult.stderr).toContain(`Ecmascript file had an error`)
          } else {
            expect(buildResult.stderr).toContain(`Failed to compile`)
            expect(buildResult.stderr).toContain(
              `Used by usingEval, usingEvalSync`
            )
            expect(buildResult.stderr).toContain(
              `Used by usingWebAssemblyCompile`
            )
          }

          expect(buildResult.stderr).toContain(DYNAMIC_CODE_ERROR)
        })
      }
    )
  }
)
