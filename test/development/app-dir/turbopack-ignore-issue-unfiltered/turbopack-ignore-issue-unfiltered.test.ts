import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('turbopack-ignore-issue - unfiltered', () => {
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
