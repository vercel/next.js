import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('logging-browser-to-terminal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should forward browser console logs to terminal with logging.browserToTerminal config', async () => {
    const browser = await next.browser('/')

    await retry(() => {
      // Check that the browser log appears in the terminal output
      expect(next.cliOutput).toContain('browser-to-terminal-test-message')
    })

    await browser.close()
  })
})
