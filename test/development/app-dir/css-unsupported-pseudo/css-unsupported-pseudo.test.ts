import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css-unsupported-pseudo',
  () => {
    const { next, skipped } = nextTestSetup({ files: __dirname })

    if (skipped) return

    it('should not surface parser warnings for unrecognized pseudo-class/element selectors', async () => {
      const outputIndex = next.cliOutput.length
      const res = await next.fetch('/page-with-pseudo')
      expect(res.status).toBe(200)

      await retry(async () => {
        const output = stripAnsi(next.cliOutput.slice(outputIndex))
        expect(output).toContain('GET /page-with-pseudo')
      })

      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(output).not.toContain('Parsing CSS source code failed')
      expect(output).not.toContain('not recognized as a valid pseudo-class')
      expect(output).not.toContain('not recognized as a valid pseudo-element')
    })
  }
)
