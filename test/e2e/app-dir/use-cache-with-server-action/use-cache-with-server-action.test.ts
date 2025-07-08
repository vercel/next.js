import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-with-server-action', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to trigger the server action', async () => {
    const browser = await next.browser('/')

    let cliOutputLength = next.cliOutput.length
    await browser.elementById('submit-button-arrow').click()
    await retry(() => {
      expect(next.cliOutput.slice(cliOutputLength)).toContain('Hello, World!')
    })

    cliOutputLength = next.cliOutput.length
    await browser.elementById('submit-button-fn').click()
    await retry(() => {
      expect(next.cliOutput.slice(cliOutputLength)).toContain('Hi, World!')
    })
  })
})
