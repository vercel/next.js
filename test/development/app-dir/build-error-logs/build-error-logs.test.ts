import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('build-error-logs', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should only log error a single time', async () => {
    await next.fetch('/')
    const output = stripAnsi(next.cliOutput)

    expect(output).toContain('Module not found')

    const moduleNotFoundLogs = output
      .split('\n')
      .filter((line) => line.includes('Module not found'))

    if (isTurbopack) {
      expect(moduleNotFoundLogs).toHaveLength(1)
    } else {
      // FIXME: next with webpack still logs the same error too many times
      expect(moduleNotFoundLogs).toHaveLength(3)
    }
  })
})
