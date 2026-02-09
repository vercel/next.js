import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('turbopack-ignore-issue', () => {
  describe('with turbopackIgnoreIssue config', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      // turbopackIgnoreIssue is turbopack-only
      skipDeployment: true,
      nextConfig: {
        experimental: {
          turbopackIgnoreIssue: [
            {
              // glob string pattern for path
              path: '**/with-warning/**',
            },
          ],
        },
      },
    })

    if (skipped) return

    it('should suppress ignored warning from cli output', async () => {
      if (!isTurbopack) {
        // turbopackIgnoreIssue only works with Turbopack
        return
      }

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
      // because our turbopackIgnoreIssue rule matches the path.
      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('a-missing-module-for-testing')
    })

    it('should still show issues for pages without ignore rules', async () => {
      // The home page should compile normally without issues
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('hello world')
    })
  })

  describe('without turbopackIgnoreIssue config', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) return

    it('should show warning in cli output when not ignored', async () => {
      // Trigger compilation of the warning page
      const outputIndex = next.cliOutput.length
      await next.fetch('/with-warning')

      // The warning about 'a-missing-module-for-testing' should appear
      // since there is no turbopackIgnoreIssue config
      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('a-missing-module-for-testing')
      })
    })
  })
})
