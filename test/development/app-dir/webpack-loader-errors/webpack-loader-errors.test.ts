import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// This test is webpack-specific because it tests custom webpack loaders
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'webpack-loader-errors',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    // Test string-error before error to ensure each error appears independently
    // in the CLI output (webpack only shows errors[0] per compilation)
    it('should show the source path and error message when a loader throws a plain string', async () => {
      await next.fetch('/string-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        // The error output should contain the path of the source file
        expect(output).toContain('string-error.data')
        // The actual error message should be present (webpack wraps string
        // throws in NonErrorEmittedError)
        expect(output).toContain(
          'A string error thrown by string-error-loader'
        )
      })
    })

    it('should show the source path and error message when a loader throws an Error', async () => {
      await next.fetch('/error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        // The error output should contain the path of the source file
        expect(output).toContain('error.data')
        // The actual error message should be present
        expect(output).toContain('An error thrown by error-loader')
      })
    })

    it('should surface an unhandled rejected Promise from a loader', async () => {
      await next.fetch('/promise-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        // The unhandled rejection should include the loader path in the
        // stack trace and the error message
        expect(output).toContain('promise-error-loader')
        expect(output).toContain(
          'An error thrown by promise-error-loader'
        )
      })
    })

    it('should surface a setTimeout error thrown after loader completion', async () => {
      await next.fetch('/timeout-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        // The uncaught exception should include the loader path in the
        // stack trace and the error message
        expect(output).toContain('timeout-error-loader')
        expect(output).toContain(
          'An error thrown by timeout-error-loader'
        )
      })
    })
  }
)
