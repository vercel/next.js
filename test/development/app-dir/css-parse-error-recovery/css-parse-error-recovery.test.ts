import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// turbopack.ignoreIssue only works with Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css-parse-error-recovery',
  () => {
    describe('with turbopack.ignoreIssue config', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        nextConfig: {
          turbopack: {
            ignoreIssue: [
              {
                path: '**/css-error/**',
              },
            ],
          },
        },
      })

      if (skipped) return

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

    describe('without turbopack.ignoreIssue config', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
      })

      if (skipped) return

      it('should show CSS parse error in cli output when not ignored', async () => {
        const outputIndex = next.cliOutput.length
        await next.fetch('/css-error')

        await retry(async () => {
          const output = stripAnsi(next.cliOutput.slice(outputIndex))
          expect(output).toContain('Parsing CSS source code failed')
        })
      })
    })
  }
)
