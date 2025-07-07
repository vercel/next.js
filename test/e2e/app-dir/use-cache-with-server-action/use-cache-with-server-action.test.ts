import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-with-server-action', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to trigger the server action', async () => {
    const browser = await next.browser('/')
    const cliOutputLength = next.cliOutput.length
    await browser.elementById('submit-button').click()

    await retry(() =>
      expect(next.cliOutput.slice(cliOutputLength)).toContain('Hello, World!')
    )
  })
})
