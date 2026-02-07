import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('browser-log-forwarding verbose level', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should forward all logs to terminal', async () => {
    const outputIndex = next.cliOutput.length
    await next.browser('/')

    await retry(() => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain('[browser] browser error:')
      expect(output).toContain('[browser] browser warn:')
      expect(output).toContain('[browser] browser log:')
      expect(output).toContain('[browser] browser debug:')
    })

    // Get final output after logs are forwarded
    const output = next.cliOutput.slice(outputIndex)

    // Filter to only browser forwarded logs, excluding noise
    const browserLogs = output
      .split('\n')
      .filter(
        (line) =>
          line.includes('[browser]') &&
          !line.includes('Next.js hydrate callback fire') &&
          !line.includes('connected to ws at') &&
          !line.includes('received ws message') &&
          !line.includes('Download the React DevTools') &&
          !line.includes('Next.js page already hydrated')
      )
      .join('\n')

    expect(browserLogs).toMatchInlineSnapshot(`
     "[browser] browser log: this is a log message (app/page.tsx:7:13)
     [browser] browser info: this is an info message (app/page.tsx:8:13)
     [browser] browser warn: this is a warning message (app/page.tsx:9:13)
     [browser] browser error: this is an error message 
     [browser] browser debug: this is a debug message (app/page.tsx:11:13)"
    `)
  })
})
