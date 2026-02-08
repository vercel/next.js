import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  waitForRedbox,
  getRedboxSource,
  getRedboxDescription,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('webpack-loader-errors', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (!isNextDev) {
    it('should skip in non-dev mode', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  describe('CLI output', () => {
    // Test string-error before error to ensure each error appears independently
    // in the CLI output (webpack only shows errors[0] per compilation)
    it('should show the loader path and error message when a loader throws a plain string', async () => {
      await next.fetch('/string-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain('string-error.data')
        expect(output).toContain('loaders/string-error-loader')
        expect(output).toContain(
          'A string error thrown by string-error-loader'
        )
      })
    })

    it('should show the loader path and error message when a loader throws an Error', async () => {
      await next.fetch('/error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain('error.data')
        expect(output).toContain('loaders/error-loader')
        expect(output).toContain('An error thrown by error-loader')
      })
    })

    it('should surface an unhandled rejected Promise from a loader', async () => {
      await next.fetch('/promise-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain('loaders/promise-error-loader')
        expect(output).toContain('An error thrown by promise-error-loader')
      })
    })

    it('should surface a setTimeout error thrown after loader completion', async () => {
      await next.fetch('/timeout-error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain('loaders/timeout-error-loader')
        expect(output).toContain('An error thrown by timeout-error-loader')
      })
    })
  })

  describe('error overlay', () => {
    it('should show error overlay with loader path when a loader throws a plain string', async () => {
      const browser = await next.browser('/string-error')
      await waitForRedbox(browser)

      const description = await getRedboxDescription(browser)
      expect(description).toContain(
        'A string error thrown by string-error-loader'
      )

      const source = await getRedboxSource(browser)
      expect(source).toContain('loaders/string-error-loader')
    })

    it('should show error overlay with loader path when a loader throws an Error', async () => {
      const browser = await next.browser('/error')
      await waitForRedbox(browser)

      const description = await getRedboxDescription(browser)
      expect(description).toContain('An error thrown by error-loader')

      const source = await getRedboxSource(browser)
      expect(source).toContain('loaders/error-loader')
    })
  })
})
