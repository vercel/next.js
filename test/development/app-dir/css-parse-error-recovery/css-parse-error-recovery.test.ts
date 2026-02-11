import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('css-parse-error-recovery', () => {
  describe('with turbopackIgnoreIssue config', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          turbopackIgnoreIssue: [
            {
              path: '**/css-error/**',
            },
          ],
        },
      },
    })

    if (skipped) return
    if (!isTurbopack) {
      it('should skip tests since turbopackIgnoreIssue only works with Turbopack', () => {})
      return
    }

    it('should render page with ignored CSS parse error', async () => {
      const res = await next.fetch('/css-error')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('css error page')
    })

    it('should suppress CSS parse error from cli output when ignored', async () => {
      const outputIndex = next.cliOutput.length
      await next.fetch('/css-error')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /css-error')
      })

      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('Parsing CSS source code failed')
    })
  })

  describe('without turbopackIgnoreIssue config', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) return

    it('should show CSS parse error in cli output when not ignored', async () => {
      if (!isTurbopack) {
        return
      }

      const outputIndex = next.cliOutput.length
      await next.fetch('/css-error')

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('Parsing CSS source code failed')
      })
    })
  })
})
