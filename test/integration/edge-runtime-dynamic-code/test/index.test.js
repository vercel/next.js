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

const isTurbopack = process.env.IS_TURBOPACK_TEST

describe('Page using eval in development mode', () => {
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

  it('does not issue dynamic code evaluation warnings', async () => {
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
                    // TODO(veil): Turbopack duplicates project path
                    '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/utils.js:3:17)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:12:54)' +
                    '\n  1 | export async function usingEval() {'
                : '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/lib/utils.js:3:19)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:12:54)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at eval (../packages/next/dist'
            )
          } else {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    // TODO(veil): Turbopack duplicates project path
                    '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/utils.js:3:17)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:12:41)' +
                    '\n  1 | export async function usingEval() {'
                : '\n    at usingEval (../../test/integration/edge-runtime-dynamic-code/lib/utils.js:3:19)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:12:41)' +
                    '\n  1 | export async function usingEval() {'
            )
          }

          // Turbopack produces incorrect mappings in the sourcemap.
          if (isTurbopack) {
            expect(output).toContain(
              '' +
                "\n> 3 |   return { value: eval('100') }" +
                '\n    |                 ^'
            )
          } else {
            expect(output).toContain(
              '' +
                "\n> 3 |   return { value: eval('100') }" +
                '\n    |                   ^'
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
            // Turbopack produces incorrect mappings in the sourcemap.
            expect(output).toContain(
              isTurbopack
                ? '' +
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:18)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:24:68)' +
                    '\n  20 |' +
                    '\n  21 | export async function usingWebAssemblyCompile(x) {' +
                    '\n> 22 |   const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)' +
                    '\n     |                  ^'
                : '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:24)' +
                    '\n    at middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:24:68)' +
                    // Next.js internal frame. Feel free to adjust.
                    // Not ignore-listed because we're not in an isolated app and Next.js is symlinked so it's not in node_modules
                    '\n    at'
            )
          } else {
            // Turbopack produces incorrect mappings in the sourcemap.
            expect(output).toContain(
              isTurbopack
                ? '' +
                    // TODO(veil): Turbopack duplicates project path
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:18)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:20:55)' +
                    '\n  20 |'
                : '' +
                    '\n    at usingWebAssemblyCompile (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:22:24)' +
                    '\n    at handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:20:55)' +
                    '\n  20 |'
            )

            // Turbopack produces incorrect mappings in the sourcemap.
            if (isTurbopack) {
              expect(output).toContain(
                '' +
                  '\n> 22 |   const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)' +
                  '\n     |                  ^'
              )
            } else {
              // TODO(veil): Inconsistent cursor position
              expect(output).toContain(
                '' +
                  '\n> 22 |   const module = await WebAssembly.compile(SQUARE_WASM_BUFFER)' +
                  '\n     |                        ^'
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
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:24)' +
                    '\n    at async middleware (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/middleware.js:39:30)' +
                    '\n  26 |\n'
                : '' +
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:24)' +
                    '\n    at async middleware (../../test/integration/edge-runtime-dynamic-code/middleware.js:39:30)' +
                    // Next.js internal frame. Feel free to adjust.
                    // TODO(veil): https://linear.app/vercel/issue/NDX-464
                    '\n    at '
            )
            expect(stripAnsi(output)).toContain(
              '' +
                '\n> 28 |   const { instance } = await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})' +
                '\n     |                        ^'
            )
          } else {
            expect(output).toContain(
              isTurbopack
                ? '' +
                    // TODO(veil): Turbopack duplicates project path
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:24)' +
                    '\n    at async handler (../../test/integration/edge-runtime-dynamic-code/test/integration/edge-runtime-dynamic-code/pages/api/route.js:28:26)' +
                    '\n  26 |'
                : '' +
                    '\n    at async usingWebAssemblyInstantiateWithBuffer (../../test/integration/edge-runtime-dynamic-code/lib/wasm.js:28:24)' +
                    '\n    at async handler (../../test/integration/edge-runtime-dynamic-code/pages/api/route.js:28:26)' +
                    '\n  26 |'
            )
            // TODO(veil): Inconsistent cursor position
            expect(stripAnsi(output)).toContain(
              '' +
                '\n> 28 |   const { instance } = await WebAssembly.instantiate(SQUARE_WASM_BUFFER, {})' +
                '\n     |                        ^'
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
          if (process.env.IS_TURBOPACK_TEST) {
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
