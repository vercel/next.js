import { nextTestSetup, isNextDev, isNextStart, isRspack } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'

const EVAL_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function') not allowed in Edge Runtime`
const DYNAMIC_CODE_ERROR = `Dynamic Code Evaluation (e. g. 'eval', 'new Function', 'WebAssembly.compile') not allowed in Edge Runtime`
const WASM_COMPILE_ERROR = `Dynamic WASM code generation (e. g. 'WebAssembly.compile') not allowed in Edge Runtime`
const WASM_INSTANTIATE_ERROR = `Dynamic WASM code generation ('WebAssembly.instantiate' with a buffer parameter) not allowed in Edge Runtime`

jest.setTimeout(1000 * 60 * 2)

type NextFetchResponse = Awaited<
  ReturnType<ReturnType<typeof nextTestSetup>['next']['fetch']>
>

describe('Page using eval in development mode', () => {
  if (!isNextDev) {
    it('only runs in dev mode', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not issue dynamic code evaluation warnings', async () => {
    const outputIndex = next.cliOutput.length
    const html = await next.render('/')
    expect(html).toMatch(/>.*?100.*?and.*?100.*?<\//)

    await retry(async () => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).not.toContain(EVAL_ERROR)
      expect(output).not.toContain(DYNAMIC_CODE_ERROR)
      expect(output).not.toContain(WASM_COMPILE_ERROR)
      expect(output).not.toContain(WASM_INSTANTIATE_ERROR)
    })
  })
})

describe.each([
  {
    title: 'Middleware',
    computeRoute(useCase: string) {
      return `/${useCase}`
    },
    async extractValue(response: NextFetchResponse) {
      return JSON.parse(response.headers.get('data')!).value
    },
  },
  {
    title: 'Edge route',
    computeRoute(useCase: string) {
      return `/api/route?case=${useCase}`
    },
    async extractValue(response: NextFetchResponse) {
      return (await response.json()).value
    },
  },
])(
  '$title usage of dynamic code evaluation',
  ({ extractValue, computeRoute, title }) => {
    if (isNextDev) {
      const { next } = nextTestSetup({
        files: __dirname,
      })

      it('shows a warning when running code with eval', async () => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(computeRoute('using-eval'))
        expect(await extractValue(res)).toEqual(100)

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          expect(output).toContain(EVAL_ERROR)
        })

        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain("eval('100')")
      })

      it('does not show warning when no code uses eval', async () => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(computeRoute('not-using-eval'))
        expect(await extractValue(res)).toEqual(100)

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          expect(output).not.toContain('Dynamic Code Evaluation')
        })
      })

      it('shows a warning when running WebAssembly.compile', async () => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(computeRoute('using-webassembly-compile'))
        expect(await extractValue(res)).toEqual(81)

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          expect(output).toContain(WASM_COMPILE_ERROR)
        })

        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain('WebAssembly.compile')
      })

      it('shows a warning when running WebAssembly.instantiate with a buffer parameter', async () => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(
          computeRoute('using-webassembly-instantiate-with-buffer')
        )
        expect(await extractValue(res)).toEqual(81)

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          expect(output).toContain(WASM_INSTANTIATE_ERROR)
        })

        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('WebAssembly.instantiate(SQUARE_WASM_BUFFER')
      })

      it('does not show a warning when running WebAssembly.instantiate with a module parameter', async () => {
        const outputIndex = next.cliOutput.length
        const res = await next.fetch(
          computeRoute('using-webassembly-instantiate')
        )
        expect(await extractValue(res)).toEqual(81)

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          expect(output).not.toContain(WASM_INSTANTIATE_ERROR)
          expect(output).not.toContain('DynamicWasmCodeGenerationWarning')
        })
      })
    }

    if (isNextStart) {
      const { next, isTurbopack } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should have middleware warning during build', async () => {
        const { cliOutput } = await next.build()

        if (isTurbopack) {
          expect(cliOutput).toContain(`Ecmascript file had an error`)
        } else if (isRspack) {
          expect(cliOutput).toContain(`Failed to compile`)
        } else {
          expect(cliOutput).toContain(`Failed to compile`)
          expect(cliOutput).toContain(`Used by usingEval, usingEvalSync`)
          expect(cliOutput).toContain(`Used by usingWebAssemblyCompile`)
        }

        expect(cliOutput).toContain(DYNAMIC_CODE_ERROR)
      })
    }
  }
)
