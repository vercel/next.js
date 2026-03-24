import { nextTestSetup } from 'e2e-utils'
import { retry } from '../../../lib/next-test-utils'

describe('actions-unused-args', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // No access to runtime logs when deployed.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not call server actions with unused arguments', async () => {
    const browser = await next.browser('/')
    const cliOutputLength = next.cliOutput.length
    await browser.elementById('action-button').click()

    await retry(async () => {
      const actionLog = next.cliOutput
        .slice(cliOutputLength)
        .split('\n')
        .find((line) => line.includes('Action called'))

      // We expect only 1 argument because the click event from the onClick
      // handler should be omitted as an unused argument.
      expect(actionLog).toBe('Action called with value: 42 (total args: 1)')
    })
  })
})
