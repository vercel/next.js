import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox, waitForRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('turbopack-ignore-issue', () => {
  describe('with turbopack.ignoreIssue config', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      // turbopack.ignoreIssue is turbopack-only
      skipDeployment: true,
      nextConfig: {
        turbopack: {
          ignoreIssue: [
            {
              // glob string pattern for path
              path: '**/with-warning/**',
            },
            {
              path: '**/with-error/**',
            },
            {
              path: '**/server-with-warning/**',
            },
            {
              path: '**/server-with-error/**',
            },
            {
              path: '**/route-with-warning/**',
            },
            {
              path: '**/route-with-error/**',
            },
          ],
        },
      },
    })

    if (skipped) return
    if (!isTurbopack) {
      it('should skip tests since turbopack.ignoreIssue only works with Turbopack', () => {})
      return
    }

    it('should suppress ignored warning from cli output', async () => {
      // Trigger compilation of the warning page
      const outputIndex = next.cliOutput.length
      await next.fetch('/with-warning')

      // Wait for compilation to finish (the GET log line confirms the page
      // was fully compiled and rendered).
      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /with-warning')
      })

      // Now that compilation is complete, the warning should be absent
      // because our turbopack.ignoreIssue rule matches the path.
      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('a-missing-module-for-testing')
    })

    it('should suppress ignored error from error overlay', async () => {
      // Navigate to the page with a top-level require of a missing module
      // (outside try-catch), which normally produces an error shown in the
      // error overlay.
      const browser = await next.browser('/with-error')
      await waitForNoRedbox(browser)
    })

    it('should suppress ignored server component warning from cli output', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/server-with-warning')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /server-with-warning')
      })

      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain(
        'a-missing-module-for-server-warning-testing'
      )
    })

    it('should suppress ignored server component error from error overlay', async () => {
      const browser = await next.browser('/server-with-error')
      await waitForNoRedbox(browser)
    })

    it('should suppress ignored route handler warning from cli output', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/route-with-warning')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /route-with-warning')
      })

      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('a-missing-module-for-route-warning-testing')
    })

    it('should suppress ignored route handler error from cli output', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/route-with-error')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /route-with-error')
      })

      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('a-missing-module-for-route-error-testing')
    })

    it('should still show issues for pages without ignore rules', async () => {
      // The home page should compile normally without issues
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('hello world')
    })
  })

  describe('without turbopack.ignoreIssue config', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) return

    it('should show warning in cli output when not ignored', async () => {
      // Trigger compilation of the warning page
      const outputIndex = next.cliOutput.length
      await next.fetch('/with-warning')

      // The warning about 'a-missing-module-for-testing' should appear
      // since there is no turbopack.ignoreIssue config
      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('a-missing-module-for-testing')
      })
    })

    it('should show error in error overlay when not ignored', async () => {
      if (!isTurbopack) {
        // turbopack.ignoreIssue only works with Turbopack
        return
      }

      // Navigate to the page with a top-level require of a missing module.
      // Without turbopack.ignoreIssue, the error should appear in the overlay.
      const browser = await next.browser('/with-error')
      await waitForRedbox(browser)
    })

    it('should show server component warning in cli output when not ignored', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/server-with-warning')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('a-missing-module-for-server-warning-testing')
      })
    })

    it('should show server component error in error overlay when not ignored', async () => {
      if (!isTurbopack) {
        return
      }

      const browser = await next.browser('/server-with-error')
      await waitForRedbox(browser)
    })

    it('should show route handler warning in cli output when not ignored', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/route-with-warning')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('a-missing-module-for-route-warning-testing')
      })
    })

    it('should show route handler error in cli output when not ignored', async () => {
      if (!isTurbopack) {
        return
      }

      const outputIndex = next.cliOutput.length
      await next.fetch('/route-with-error')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('a-missing-module-for-route-error-testing')
      })
    })
  })
})
