import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('turbopack-ignore-issue', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // turbopackIgnoreIssue is turbopack-only
    skipDeployment: true,
  })

  if (skipped) return

  it('should suppress ignored warning from cli output', async () => {
    // Trigger compilation of the warning page
    const outputIndex = next.cliOutput.length
    await next.fetch('/with-warning')

    // Wait briefly for output to settle
    await retry(async () => {
      const output = stripAnsi(next.cliOutput.slice(outputIndex))
      // The warning about 'a-missing-module-for-testing' should be suppressed
      // because our turbopackIgnoreIssue rule matches the path and title
      expect(output).not.toContain('a-missing-module-for-testing')
    })
  })

  it('should still show issues for pages without ignore rules', async () => {
    // The home page should compile normally without issues
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('hello world')
  })
})
