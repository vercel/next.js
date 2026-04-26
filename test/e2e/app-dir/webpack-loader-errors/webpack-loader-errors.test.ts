import { nextTestSetup } from 'e2e-utils'
import { retry, waitForRedbox, getRedboxSource } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('webpack-loader-errors', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
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
      await retry(
        async () => {
          const output = stripAnsi(next.cliOutput)
          expect(output).toContain('string-error.data')
          expect(output).toContain(
            'A string error thrown by string-error-loader'
          )
          expect(output).toMatch(/\(from .+loaders\/string-error-loader/)
        },
        // webpack compilation output appears asynchronously
        30_000
      )
    })

    it('should show the loader path and error message when a loader throws an Error', async () => {
      await next.fetch('/error')
      await retry(async () => {
        const output = stripAnsi(next.cliOutput)
        expect(output).toContain('error.data')
        expect(output).toContain('An error thrown by error-loader')
        expect(output).toMatch(/\(from .+loaders\/error-loader/)
      }, 30_000)
    })

    // The following CLI tests are Turbopack-only because webpack's CLI output
    // only logs errors[0] per compilation (see store.ts). When multiple pages
    // have errors, only the first error (by module order) is shown. These
    // error types still work correctly and are tested via the overlay tests.
    if (isTurbopack) {
      it('should surface an unhandled rejected Promise from a loader', async () => {
        await next.fetch('/promise-error')
        await retry(async () => {
          const output = stripAnsi(next.cliOutput)
          expect(output).toContain('An error thrown by promise-error-loader')
        })
      })

      it('should surface a setTimeout error thrown after loader completion', async () => {
        await next.fetch('/timeout-error')
        await retry(async () => {
          const output = stripAnsi(next.cliOutput)
          expect(output).toContain('An error thrown by timeout-error-loader')
        })
      })

      it('should show the loader path and error message when a loader throws an Error without stack', async () => {
        await next.fetch('/no-stack-error')
        await retry(async () => {
          const output = stripAnsi(next.cliOutput)
          expect(output).toContain(
            'An error without stack from no-stack-error-loader'
          )
          expect(output).toMatch(/\(from .+loaders\/no-stack-error-loader/)
        })
      })

      it('should show the loader path and error message when a loader throws a filesystem error', async () => {
        await next.fetch('/fs-error')
        await retry(async () => {
          const output = stripAnsi(next.cliOutput)
          expect(output).toContain('ENOENT')
          expect(output).toMatch(/\(from .+loaders\/fs-error-loader/)
        })
      })
    }
  })

  // Build errors accumulate globally and the overlay shows the first build
  // error (no pagination for build errors). After the CLI tests compile all
  // error routes, the overlay may show any accumulated error. So we only
  // verify that a loader error with "(from ...)" is displayed, not which
  // specific one. The CLI tests above validate each error type specifically.
  describe('error overlay', () => {
    it('should show error overlay with loader path when a loader throws a plain string', async () => {
      const browser = await next.browser('/string-error')
      await waitForRedbox(browser)

      const source = await getRedboxSource(browser)
      expect(source).toMatch(/\(from .+loaders\//)
    })

    it('should show error overlay with loader path when a loader throws an Error', async () => {
      const browser = await next.browser('/error')
      await waitForRedbox(browser)

      const source = await getRedboxSource(browser)
      expect(source).toMatch(/\(from .+loaders\//)
    })

    it('should show error overlay with loader path when a loader throws an Error without stack', async () => {
      const browser = await next.browser('/no-stack-error')
      await waitForRedbox(browser)

      const source = await getRedboxSource(browser)
      expect(source).toMatch(/\(from .+loaders\//)
    })

    it('should show error overlay with loader path when a loader throws a filesystem error', async () => {
      const browser = await next.browser('/fs-error')
      await waitForRedbox(browser)

      const source = await getRedboxSource(browser)
      expect(source).toMatch(/\(from .+loaders\//)
    })
  })
})
