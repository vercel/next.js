import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('browser-log-forwarding warn level', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should forward warn and error logs to terminal', async () => {
    const outputIndex = next.cliOutput.length
    await next.browser('/')

    await retry(() => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain('browser error:')
      expect(output).toContain('browser warn:')
    })

    // Get final output after logs are forwarded
    const output = next.cliOutput.slice(outputIndex)

    // Filter to only browser forwarded logs, excluding hydration noise
    const browserLogs = output
      .split('\n')
      .filter(
        (line) =>
          line.includes('[browser]') &&
          !line.includes('Next.js hydrate callback fire')
      )
      .join('\n')

    expect(browserLogs).toMatchInlineSnapshot(`
     "[browser] browser warn: this is a warning message (app/page.tsx:9:13)
     [browser] browser error: this is an error message "
    `)
  })
})
